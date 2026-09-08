import { Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";
import { withTenant, schema, type Tx } from "@ind-core/db";
import {
  AppError,
  Errors,
  currentTenant,
  deliveryHealth,
  newId,
  rotationPlan,
  signWebhook,
  verifyWebhook,
  type SubscriptionStatus,
} from "@ind-core/platform";
import { AuditLogService } from "../../common/audit-log.service.js";

const { webhookSubscription, webhookDelivery, credential } = schema;

/**
 * OUTBOUND WEBHOOKS.
 *
 * The demo-visible parts are the signature and the auto-pause, and both exist for the same
 * reason: a webhook is an HTTP call to somebody else's server carrying our data, and we
 * control neither the receiver's security nor their uptime.
 *
 * Secrets live in `credential` (KMS-wrapped) and are referenced, never returned. The one
 * moment a secret is visible is when a subscription is created or rotated, and only then.
 */
@Injectable()
export class WebhookService {
  constructor(private readonly audit: AuditLogService) {}

  async subscribe(input: { subscriberName: string; targetUrl: string; eventNames: string[] }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    if (!input.targetUrl.startsWith("https://")) {
      // A signed payload sent over plain http is signed and readable.
      throw new AppError("INT_WEBHOOK_INSECURE", 422, "A webhook target must be https. A signed payload over plain http is signed and readable.");
    }
    if (input.eventNames.length === 0) {
      throw new AppError("INT_WEBHOOK_NO_EVENTS", 422, "A subscription with no events will never fire, and looks configured.");
    }

    return withTenant(async (tx) => {
      const secret = `whsec_${newId().replace(/-/g, "")}`;
      const credId = newId();
      await tx.insert(credential).values({
        id: credId, tenantId, createdBy: actorId, updatedBy: actorId,
        label: `webhook:${input.subscriberName}`,
        credentialType: "hmac_secret",
        // In production this is a KMS-wrapped data key; the plaintext never lands here.
        encryptedDataKey: `kms:demo:${newId().slice(-12)}`,
        ciphertextRef: `secretsmanager://webhook/${input.subscriberName}`,
        lastRotatedAt: new Date(),
      });

      const id = newId();
      await tx.insert(webhookSubscription).values({
        id, tenantId, createdBy: actorId, updatedBy: actorId,
        subscriberName: input.subscriberName,
        targetUrl: input.targetUrl,
        eventNames: input.eventNames as unknown as object,
        secretCredentialId: credId,
        status: "active",
      });

      await this.audit.appendInTx(tx, {
        action: "integration.webhook.subscribed",
        entityType: "webhook_subscription",
        entityId: id,
        data: { subscriberName: input.subscriberName, targetUrl: input.targetUrl, events: input.eventNames },
      });

      return {
        subscriberName: input.subscriberName,
        targetUrl: input.targetUrl,
        eventNames: input.eventNames,
        secret,
        warning: "This signing secret is shown once. Store it on the receiving side now.",
      };
    });
  }

  /**
   * Deliver one event.
   *
   * The signature binds the timestamp INTO the HMAC, which is what makes the replay window
   * enforceable rather than advisory: signing the payload alone lets a captured message be
   * replayed forever.
   */
  async deliver(input: {
    subscriberName: string;
    eventName: string;
    payload: unknown;
    secret: string;
    /** Fake-adapter transport result. */
    simulate?: { responseCode?: number };
    asOf?: string;
  }): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const now = input.asOf ? Date.parse(input.asOf) : Date.now();
    const tSeconds = Math.floor(now / 1000);

    return withTenant(async (tx) => {
      const sub = await this.subByName(tx, input.subscriberName);
      if (sub.status !== "active") {
        return { subscriberName: input.subscriberName, delivered: false, status: sub.status, note: `Subscription is ${sub.status}; nothing was sent.` };
      }
      const events = (sub.eventNames as string[]) ?? [];
      if (!events.includes(input.eventName)) {
        return { subscriberName: input.subscriberName, delivered: false, note: `Not subscribed to ${input.eventName}.` };
      }

      const body = JSON.stringify(input.payload);
      const signature = signWebhook(body, input.secret, tSeconds);
      const code = input.simulate?.responseCode ?? 200;
      const delivered = code >= 200 && code < 300;

      const eventId = newId();
      await tx.insert(webhookDelivery).values({
        id: newId(), tenantId, createdBy: actorId, updatedBy: actorId,
        subscriptionId: sub.id,
        eventId,
        eventName: input.eventName,
        attemptNo: 1,
        signatureTs: tSeconds,
        responseCode: code,
        responseTimeMs: 35,
        status: delivered ? "delivered" : "retrying",
      });

      const health = deliveryHealth({
        status: sub.status as SubscriptionStatus,
        consecutiveFailures: sub.consecutiveFailures,
        lastOutcome: delivered ? "success" : "failure",
      });
      await tx
        .update(webhookSubscription)
        .set({ status: health.status, consecutiveFailures: health.consecutiveFailures, lastDeliveryAt: new Date(now), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(webhookSubscription.id, sub.id));

      if (health.shouldAutoPause) {
        await this.audit.appendInTx(tx, {
          action: "integration.webhook.auto_paused",
          entityType: "webhook_subscription",
          entityId: sub.id,
          data: { subscriberName: input.subscriberName, consecutiveFailures: health.consecutiveFailures },
        });
      }

      return { subscriberName: input.subscriberName, eventName: input.eventName, delivered, responseCode: code, signature, subscriptionStatus: health.status, note: health.message };
    });
  }

  /** Verify an inbound signature — the same check we ask receivers to run. */
  verify(input: { payload: string; header: string; secret: string; previousSecret?: string; nowSeconds: number }): Record<string, unknown> {
    return { ...verifyWebhook(input) };
  }

  /**
   * Rotate a signing secret with a grace period.
   *
   * Both secrets verify until the grace expires, so the receiver redeploys on their own
   * schedule. A rotation with no grace period is a coordinated outage, which is why nobody
   * does it — and a secret nobody rotates is a secret forever.
   */
  async rotate(subscriberName: string, graceHours = 48): Promise<Record<string, unknown>> {
    const { tenantId, actorId } = currentTenant();
    const now = new Date().toISOString();
    return withTenant(async (tx) => {
      const sub = await this.subByName(tx, subscriberName);
      const secret = `whsec_${newId().replace(/-/g, "")}`;
      const credId = newId();
      await tx.insert(credential).values({
        id: credId, tenantId, createdBy: actorId, updatedBy: actorId,
        label: `webhook:${subscriberName}:v${Date.now()}`,
        credentialType: "hmac_secret",
        encryptedDataKey: `kms:demo:${newId().slice(-12)}`,
        ciphertextRef: `secretsmanager://webhook/${subscriberName}`,
        lastRotatedAt: new Date(),
      });

      const plan = rotationPlan({ rotatedAt: now, graceHours });
      await tx
        .update(webhookSubscription)
        .set({
          previousSecretCredentialId: sub.secretCredentialId,
          secretCredentialId: credId,
          rotationGraceUntil: new Date(plan.graceUntil),
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(webhookSubscription.id, sub.id));

      await this.audit.appendInTx(tx, {
        action: "integration.webhook.rotated",
        entityType: "webhook_subscription",
        entityId: sub.id,
        data: { subscriberName, graceUntil: plan.graceUntil },
      });
      return { subscriberName, secret, ...plan, warning: "Shown once. The previous secret keeps working until the grace expires." };
    });
  }

  async subscriptions(): Promise<Record<string, unknown>[]> {
    return withTenant(async (tx) => {
      const rows = await tx.select().from(webhookSubscription).orderBy(asc(webhookSubscription.subscriberName));
      const deliveries = await tx.select().from(webhookDelivery);
      return rows.map((r) => ({
        subscriberName: r.subscriberName,
        targetUrl: r.targetUrl,
        eventNames: r.eventNames,
        status: r.status,
        consecutiveFailures: r.consecutiveFailures,
        rotationGraceUntil: r.rotationGraceUntil,
        deliveries: deliveries.filter((d) => d.subscriptionId === r.id).length,
        note:
          r.status === "auto_paused"
            ? "Auto-paused after repeated failures. Continuing would be a slow denial-of-service against an endpoint that has very likely gone away."
            : null,
      }));
    });
  }

  private async subByName(tx: Tx, name: string) {
    const [s] = await tx.select().from(webhookSubscription).where(eq(webhookSubscription.subscriberName, name)).limit(1);
    if (!s) throw Errors.notFound(`webhook subscription ${name}`);
    return s;
  }
}

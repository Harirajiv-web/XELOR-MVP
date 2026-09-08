import assert from "node:assert/strict";
import test from "node:test";
import { deliverMessage, DeliveryError } from "./notify-provider.js";
const message = {
  id: "test-outbox",
  channel: "email",
  provider: "resend",
  recipient: "supplier@example.invalid",
  template: "rfq_invitation",
  subject: "RFQ",
  body: "Please quote",
  variables: {},
};
test("email adapter uses provider idempotency and returns receipt", async () => {
  const transport = (async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(
      (init!.headers as Record<string, string>)["Idempotency-Key"],
      "outbox/test-outbox",
    );
    assert.equal(JSON.parse(init!.body as string).text, "Please quote");
    return new Response(JSON.stringify({ id: "email-123" }), { status: 200 });
  }) as typeof fetch;
  assert.equal(
    await deliverMessage(
      message,
      {
        RESEND_API_KEY: "fake-test-key",
        NOTIFY_EMAIL_FROM: "buyer@example.invalid",
      },
      transport,
    ),
    "email-123",
  );
});
test("WhatsApp adapter requires an approved configured template", async () => {
  let calls = 0;
  const transport = (async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.template.components[0].parameters[0].text, "RFQ-17");
    return new Response(JSON.stringify({ messages: [{ id: "wa-123" }] }), {
      status: 200,
    });
  }) as typeof fetch;
  const env = {
    WHATSAPP_ACCESS_TOKEN: "test",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_GRAPH_VERSION: "v22.0",
    WHATSAPP_TEMPLATES_JSON: JSON.stringify({
      rfq_invitation: {
        name: "approved_invite",
        language: "en",
        bodyVariables: ["rfqNo"],
      },
    }),
  };
  assert.equal(
    await deliverMessage(
      {
        ...message,
        channel: "whatsapp",
        provider: "whatsapp_cloud",
        variables: { rfqNo: "RFQ-17" },
      },
      env,
      transport,
    ),
    "wa-123",
  );
  await assert.rejects(
    () =>
      deliverMessage(
        { ...message, channel: "whatsapp", provider: "whatsapp_cloud" },
        env,
        transport,
      ),
    /Missing WhatsApp/,
  );
  assert.equal(calls, 1);
});
test("timeout and provider 5xx are uncertain delivery and must not auto-retry", async () => {
  const env = {
    RESEND_API_KEY: "test",
    NOTIFY_EMAIL_FROM: "buyer@example.invalid",
  };
  await assert.rejects(
    () =>
      deliverMessage(message, env, (async () => {
        throw new Error("timeout");
      }) as typeof fetch),
    (error: unknown) => error instanceof DeliveryError && error.uncertain,
  );
  await assert.rejects(
    () =>
      deliverMessage(
        message,
        env,
        (async () => new Response("", { status: 503 })) as typeof fetch,
      ),
    (error: unknown) => error instanceof DeliveryError && error.uncertain,
  );
});
test("invalid provider config fails before transport", async () => {
  await assert.rejects(
    () =>
      deliverMessage(message, {}, (async () => {
        throw new Error("should never be called");
      }) as typeof fetch),
    /Set RESEND_API_KEY/,
  );
});

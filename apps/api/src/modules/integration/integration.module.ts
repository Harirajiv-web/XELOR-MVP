import { Module } from "@nestjs/common";
import { IntegrationController } from "./integration.controller.js";
import { PipelineService } from "./pipeline.service.js";
import { MessageService } from "./message.service.js";
import { StatutoryService } from "./statutory.service.js";
import { WebhookService } from "./webhook.service.js";
import { FactoryConnectService } from "./factory-connect.service.js";

/**
 * INTEGRATION (HEXA, Module 15) — the edge of the system.
 *
 * Everything here talks to something outside our control: a GST portal, a bank's SFTP drop,
 * a customer's webhook endpoint. Nothing is assumed to have worked, nothing is dropped, and
 * no secret is stored in the clear.
 *
 * It exports only two read boundaries used by Agent OS: connector readiness and
 * tenant-fenced Factory Connect evidence. Business modules still do not call statutory or
 * message gateways directly; they emit an outbox event and this module decides what leaves
 * the building. That direction preserves retry, idempotency and reporting-window rules.
 *
 * There is deliberately NO AI. The governed Factory simulator evaluation consults the
 * shared global governance port so the platform kill switch still fails closed without
 * coupling Integration to the AI Operations business module. The registry carries an
 * explicit null entry for this module
 * (`integrations.no_mvp_ai`) and the dead-letter triage table is why: the error category
 * already determines what a person should do, and a model guessing at it would be slower,
 * unauditable, and capable of a confident wrong answer about a tax filing.
 */
@Module({
  controllers: [IntegrationController],
  providers: [PipelineService, MessageService, StatutoryService, WebhookService, FactoryConnectService],
  exports: [PipelineService, FactoryConnectService],
})
export class IntegrationModule {}

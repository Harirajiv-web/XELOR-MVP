import { Module } from "@nestjs/common";
import { IntegrationController } from "./integration.controller.js";
import { PipelineService } from "./pipeline.service.js";
import { MessageService } from "./message.service.js";
import { StatutoryService } from "./statutory.service.js";
import { WebhookService } from "./webhook.service.js";

/**
 * INTEGRATION (HEXA, Module 15) — the edge of the system.
 *
 * Everything here talks to something outside our control: a GST portal, a bank's SFTP drop,
 * a customer's webhook endpoint. Nothing is assumed to have worked, nothing is dropped, and
 * no secret is stored in the clear.
 *
 * It provides no port and consumes none. Modules do not call INTEGRATION — they emit an
 * outbox event and this module decides what leaves the building. That direction matters: a
 * business module that could call a statutory gateway directly is a business module that
 * can file a tax document without the retry, idempotency and window rules that live here.
 *
 * There is deliberately NO AI. The registry carries an explicit null entry for this module
 * (`integrations.no_mvp_ai`) and the dead-letter triage table is why: the error category
 * already determines what a person should do, and a model guessing at it would be slower,
 * unauditable, and capable of a confident wrong answer about a tax filing.
 */
@Module({
  controllers: [IntegrationController],
  providers: [PipelineService, MessageService, StatutoryService, WebhookService],
  exports: [PipelineService, MessageService, StatutoryService],
})
export class IntegrationModule {}

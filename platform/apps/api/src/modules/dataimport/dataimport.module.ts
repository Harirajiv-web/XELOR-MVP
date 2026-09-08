import { Module } from "@nestjs/common";
import { DataImportController } from "./dataimport.controller.js";
import { DataImportService } from "./dataimport.service.js";
import { DomainApiClient } from "./domain-client.js";

/**
 * DATA IMPORT (HEXA / INTEGRATION) — spreadsheets as a first-class way in.
 *
 * Deliberately NOT `@Global`, and it imports nothing. That is the whole point of how it is
 * built: it reaches the other modules the way an outside system would, over their own HTTP
 * endpoints with the caller's credentials, so it can be deleted from `app.module.ts` in one
 * line without a single other module noticing. Nothing depends on it and it depends on
 * nothing — which is also why it could never be the thing that lets a bad row into a master:
 * it has no privileged path to one.
 */
@Module({
  controllers: [DataImportController],
  providers: [DataImportService, DomainApiClient],
})
export class DataImportModule {}

import { Global, Module } from "@nestjs/common";
import { QualityController } from "./quality.controller.js";
import { QualityService } from "./quality.service.js";
import { INSPECTION_GATE } from "../../ports/inspection.port.js";

/**
 * INSPECTION / QMS (KILN, Module 06) — the quality system of record.
 *
 * Made @Global and exposes the INSPECTION_GATE port so Purchase (the GRN gate) and
 * Production (the manufacture gate) can ask "may this proceed?" without importing this
 * module (§1.1). Those modules keep their gates; Quality owns the definition and the
 * record (INSPECTION §1.2). Rejected material moves through the STOCK_POSTER port —
 * Quality has no write path to stock of its own (§1.4).
 */
@Global()
@Module({
  controllers: [QualityController],
  providers: [QualityService, { provide: INSPECTION_GATE, useExisting: QualityService }],
  exports: [QualityService, INSPECTION_GATE],
})
export class QualityModule {}

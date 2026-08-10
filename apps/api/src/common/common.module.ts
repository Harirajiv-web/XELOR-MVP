import { Global, Module } from "@nestjs/common";
import { NumberingService } from "./numbering.service.js";
import { AuditLogService } from "./audit-log.service.js";
import { DocumentEditService } from "./document-edit.service.js";

/**
 * Cross-cutting services every module may inject without importing another module —
 * the same escape hatch the boundary rules already allow for `AuditLogService` and the
 * tenant middleware. Nothing here belongs to a business domain.
 *
 * `@Global` so a module does not have to list it: numbering is infrastructure, and making
 * fourteen modules declare an import of it would be ceremony that teaches nothing.
 */
@Global()
@Module({
  providers: [NumberingService, AuditLogService, DocumentEditService],
  exports: [NumberingService, AuditLogService, DocumentEditService],
})
export class CommonModule {}

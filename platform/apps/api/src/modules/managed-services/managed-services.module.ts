import { Module } from "@nestjs/common";
import { ManagedServicesController } from "./managed-services.controller.js";
import { ManagedServicesService } from "./managed-services.service.js";

@Module({
  controllers: [ManagedServicesController],
  providers: [ManagedServicesService],
  exports: [ManagedServicesService],
})
export class ManagedServicesModule {}

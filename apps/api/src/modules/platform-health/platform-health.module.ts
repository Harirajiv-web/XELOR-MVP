import { Module } from "@nestjs/common";
import {
  PlatformHealthController,
  PlatformHealthCronController,
} from "./platform-health.controller.js";
import { PlatformHealthService } from "./platform-health.service.js";

@Module({
  controllers: [PlatformHealthController, PlatformHealthCronController],
  providers: [PlatformHealthService],
  exports: [PlatformHealthService],
})
export class PlatformHealthModule {}

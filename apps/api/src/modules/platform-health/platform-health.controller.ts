import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { RequirePermission } from "../../common/permission.guard.js";
import { PlatformHealthService } from "./platform-health.service.js";

@Controller("platform-health")
export class PlatformHealthController {
  constructor(private readonly health: PlatformHealthService) {}

  @Get("overview")
  @RequirePermission("platform_health.overview.read")
  async overview() {
    return { data: await this.health.overview() };
  }

  @Post("run")
  @RequirePermission("platform_health.run.execute")
  async runNow() {
    return { data: await this.health.runForCurrentTenant("manual") };
  }
}

/** Secret-protected entrypoint for Vercel Cron or any external hourly scheduler. */
@Controller("internal/platform-health")
export class PlatformHealthCronController {
  constructor(private readonly health: PlatformHealthService) {}

  @Get("run")
  async scheduledRun(@Headers("authorization") authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret || authorization !== `Bearer ${secret}`) {
      throw new UnauthorizedException("Valid cron authorization is required.");
    }
    return this.health.runAllTenants();
  }
}

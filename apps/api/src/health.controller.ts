import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { existsSync } from "node:fs";

/**
 * Lightweight liveness/readiness probe for the container platform.
 *
 * Railway starts this process only after the migration bootstrap has completed,
 * so a running controller means the schema was reachable and the API booted. The
 * endpoint deliberately performs no tenant-scoped query and exposes no demo data.
 */
@Controller("health")
export class HealthController {
  @Get()
  status(): { status: "ok"; service: "xelor-api" } {
    const readinessFile = process.env.READINESS_FILE;
    if (readinessFile && !existsSync(readinessFile)) {
      throw new ServiceUnavailableException("Demo data is still being prepared.");
    }
    return { status: "ok", service: "xelor-api" };
  }

  /** Used by the one-time seeder while the public readiness gate is still closed. */
  @Get("live")
  live(): { status: "ok"; service: "xelor-api" } {
    return { status: "ok", service: "xelor-api" };
  }
}

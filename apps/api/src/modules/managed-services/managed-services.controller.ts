import { Controller, Get } from "@nestjs/common";
import { RequirePermission } from "../../common/permission.guard.js";
import { ManagedServicesService } from "./managed-services.service.js";

@Controller("managed-services")
export class ManagedServicesController {
  constructor(private readonly services: ManagedServicesService) {}

  /**
   * One envelope is the authority for every Managed Services screen. Separate list routes
   * would let incidents, service levels and the responsibility map drift to different
   * snapshot times while somebody is explaining one incident.
   */
  @Get("overview")
  @RequirePermission("managed_services.overview.read")
  overview() {
    return { data: this.services.overview() };
  }
}

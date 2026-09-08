import { Controller, Get } from "@nestjs/common";
import { RequirePermission } from "../common/permission.guard.js";
import { FactoryIntelligenceService } from "./factory-intelligence.service.js";

@Controller("agent-os/factory-intelligence")
export class FactoryIntelligenceController {
  constructor(private readonly intelligence: FactoryIntelligenceService) {}

  @Get()
  @RequirePermission("agentos.run.read", "production.factory-connect.read")
  async overview() {
    return { data: await this.intelligence.overview() };
  }
}

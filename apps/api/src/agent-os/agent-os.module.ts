import { Module } from "@nestjs/common";
import { GeneralModule } from "../modules/general/general.module.js";
import { InventoryModule } from "../modules/inventory/inventory.module.js";
import { SalesModule } from "../modules/sales/sales.module.js";
import { PlanningModule } from "../modules/planning/planning.module.js";
import { ProductionModule } from "../modules/production/production.module.js";
import { AccountsModule } from "../modules/accounts/accounts.module.js";
import { MaintenanceModule } from "../modules/maintenance/maintenance.module.js";
import { ExpenditureModule } from "../modules/expenditure/expenditure.module.js";
import { IntegrationModule } from "../modules/integration/integration.module.js";
import { AiOpsModule } from "../modules/aiops/aiops.module.js";
import { PlatformHealthModule } from "../modules/platform-health/platform-health.module.js";
import { AgentActionService } from "./agent-action.service.js";
import { AgentAuthorizationService } from "./agent-authorization.service.js";
import { AgentGraphEngine } from "./agent-graph.engine.js";
import { AgentOsController } from "./agent-os.controller.js";
import { AgentOsService } from "./agent-os.service.js";
import { AgentRegistryService } from "./agent-registry.service.js";
import { AgentRunRepository } from "./agent-run.repository.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { DeterministicAgentReasoner } from "./agent-reasoner.service.js";
import { GraphRegistryService } from "./graph-registry.service.js";
import { DecisionIntelligenceRepository } from "./decision-intelligence.repository.js";
import { DecisionIntelligenceService } from "./decision-intelligence.service.js";
import { MvpReadinessService } from "./mvp-readiness.service.js";
import { AgentControlService } from "./agent-control.service.js";
import { AgentRecoveryService } from "./agent-recovery.service.js";

@Module({
  imports: [
    GeneralModule,
    InventoryModule,
    SalesModule,
    PlanningModule,
    ProductionModule,
    AccountsModule,
    MaintenanceModule,
    ExpenditureModule,
    IntegrationModule,
    AiOpsModule,
    PlatformHealthModule,
  ],
  controllers: [AgentOsController],
  providers: [
    AgentRegistryService,
    GraphRegistryService,
    AgentActionService,
    AgentAuthorizationService,
    CapabilityRegistryService,
    DeterministicAgentReasoner,
    AgentRunRepository,
    AgentControlService,
    AgentGraphEngine,
    AgentRecoveryService,
    DecisionIntelligenceRepository,
    DecisionIntelligenceService,
    MvpReadinessService,
    AgentOsService,
  ],
  exports: [AgentOsService],
})
export class AgentOsModule {}

import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { RequirePermission } from "../../common/permission.guard.js";
import { WorkspaceConfigService } from "./workspace-config.service.js";

@Controller("general/workspace-config")
export class WorkspaceConfigController {
  constructor(private readonly workspace: WorkspaceConfigService) {}

  @Get()
  @RequirePermission("general.company.read")
  get() {
    return this.workspace.get();
  }

  @Post()
  @HttpCode(200)
  @RequirePermission("admin.settings.write")
  save(@Body() input: unknown, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.workspace.save(input, idempotencyKey);
  }
}

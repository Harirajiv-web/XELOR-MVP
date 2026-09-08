import { Controller, Get, Module } from "@nestjs/common";
import { MeService } from "./me.service.js";

/**
 * `GET /api/v1/me` — the bootstrap call every front end makes first.
 *
 * No `@RequirePermission`. A person is always entitled to know their own access, and
 * gating this would create the situation where somebody cannot find out why they cannot do
 * anything. The tenant middleware has already established WHO is asking from a verified
 * token; this only reports what that identity already implies.
 */
@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async describe() {
    return this.me.describe();
  }
}

@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class IdentityModule {}

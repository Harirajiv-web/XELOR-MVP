import { Global, Module } from "@nestjs/common";
import { AccountsController } from "./accounts.controller.js";
import { AccountsService } from "./accounts.service.js";
import { ACCOUNTS_POSTER } from "../../ports/accounts.port.js";

/**
 * ACCOUNTS (RASP, Module 08) — the general ledger and the AR subledger.
 *
 * @Global and exposes ACCOUNTS_POSTER so SMBD can raise an invoice inside its own dispatch
 * transaction and read a customer's real outstanding. The arrow points ONE WAY: modules
 * depend on Accounts, Accounts depends on none of them. That is what keeps the module graph
 * acyclic and what makes "never re-post what a sibling already valued" structural — Accounts
 * cannot recompute a sibling's arithmetic because it cannot see a sibling's tables.
 */
@Global()
@Module({
  controllers: [AccountsController],
  providers: [AccountsService, { provide: ACCOUNTS_POSTER, useExisting: AccountsService }],
  exports: [AccountsService, ACCOUNTS_POSTER],
})
export class AccountsModule {}

import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { AccountsService } from "./accounts.service.js";

const journalSchema = z.object({
  voucherType: z.string().optional(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  narration: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(1),
        debit: z.number().nonnegative().optional(),
        credit: z.number().nonnegative().optional(),
        customerRef: z.string().uuid().optional(),
        vendorRef: z.string().uuid().optional(),
        memo: z.string().optional(),
      }),
    )
    .min(2, "a journal needs at least two lines"),
});

const receiptSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  reference: z.string().optional(),
  bankAccountCode: z.string().optional(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const reverseSchema = z.object({ reason: z.string().min(1) });

function badRequest(issues: { path: (string | number)[]; message: string }[]): never {
  throw Errors.validation(issues.map((i) => ({ field: i.path.join("."), message: i.message })));
}
function requireKey(key?: string): string {
  if (!key) throw Errors.validation([{ field: "Idempotency-Key", message: "header is required on mutations" }]);
  return key;
}

/**
 * ACCOUNTS. Note what is absent: no endpoint edits or deletes a voucher. Correction is a
 * reversal, and the database enforces that independently of this controller.
 */
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post("journals")
  @RequirePermission("accounts.journal.post")
  async postJournal(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = journalSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.accounts.postJournal(p.data, idk);
  }

  @Post("receipts")
  @RequirePermission("accounts.receipt.record")
  async receipt(@Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = receiptSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.accounts.recordReceipt(p.data, idk);
  }

  @Post("vouchers/:id/reverse")
  @RequirePermission("accounts.voucher.reverse")
  async reverse(@Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key?: string) {
    const idk = requireKey(key);
    const p = reverseSchema.safeParse(body);
    if (!p.success) badRequest(p.error.issues);
    return this.accounts.reverseVoucher(id, p.data.reason, idk);
  }

  @Get("vouchers/:id")
  @RequirePermission("accounts.ledger.read")
  async voucher(@Param("id") id: string) {
    return this.accounts.getVoucher(id);
  }

  /** The synchronous read SMBD's credit gate depends on (contract #6, < 500 ms). */
  @Get("customers/:id/outstanding")
  @RequirePermission("accounts.ledger.read")
  async outstanding(@Param("id") id: string) {
    return this.accounts.getCustomerOutstanding(id);
  }

  @Get("trial-balance")
  @RequirePermission("accounts.ledger.read")
  async trialBalance(@Query() _query: unknown) {
    return this.accounts.trialBalance();
  }
}

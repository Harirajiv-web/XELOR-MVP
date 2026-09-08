import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { NetworkService } from "./network.service.js";

const quoteSchema = z.object({
  unitPrice: z.number().min(0),
  toolingCost: z.number().min(0).optional(),
  freightCost: z.number().min(0).optional(),
  promisedDate: z.string().date().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  moq: z.number().min(0).optional(),
  supplierNote: z.string().max(1000).optional(),
});

/**
 * THE SUPPLIER ZONE — `/api/v1/supplier/:token`, no login, no RBAC grid.
 *
 * A separate controller on a separate prefix with NO permission decorators, deliberately.
 * The supplier is a workshop with a phone who will never create an account, so the signed
 * link is the whole of their identity. The safety comes from what these two routes can
 * reach rather than from who is calling them:
 *
 *   - The token is looked up by HASH and scoped to ONE invitation, so it addresses exactly
 *     one request and one supplier. There is no id parameter anywhere here to tamper with.
 *   - A bad token and an expired token are both "this link does not work". Neither confirms
 *     that a token was ever real, which is the whole of the enumeration attack.
 *   - Nothing here returns another supplier's price. A competitor's quote is not merely
 *     hidden by a check; it is not on any path these routes can travel.
 *   - What arrives lands in `network_quote_submission`, never in the buyer's own quote
 *     table. A stranger holding a URL cannot write a record into the buyer's books.
 *
 * No Idempotency-Key either: a supplier answering on a phone is not going to set a header,
 * and the unique constraint on the invitation already refuses a second submission.
 */
@Controller("supplier")
export class SupplierPortalController {
  constructor(private readonly network: NetworkService) {}

  @Get(":token")
  async open(@Param("token") token: string) {
    return this.network.openInvite(token);
  }

  @Post(":token/quote")
  async quote(@Param("token") token: string, @Body() body: unknown) {
    const p = quoteSchema.safeParse(body ?? {});
    if (!p.success) {
      throw Errors.validation(
        p.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      );
    }
    return this.network.submitQuote(token, p.data);
  }
}

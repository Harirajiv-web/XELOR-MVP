import { Body, Controller, Get, Headers, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { RequirePermission } from "../../common/permission.guard.js";
import { GeneralService } from "./general.service.js";

const createCompanySchema = z.object({
  legalName: z.string().min(1).max(200),
  cin: z.string().min(1).max(21).optional(),
  // The human's explicit "yes, create it anyway" after seeing a duplicate warning.
  acknowledgeDuplicates: z.boolean().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

@Controller("general/companies")
export class GeneralController {
  constructor(private readonly general: GeneralService) {}

  @Post()
  @RequirePermission("general.company.create")
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
    // §5.3: Idempotency-Key is required on mutating endpoints.
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw Errors.validation([
        { field: "Idempotency-Key", message: "header is required on mutations" },
      ]);
    }
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    const { acknowledgeDuplicates, ...input } = parsed.data;
    const result = await this.general.createCompany(input, idempotencyKey, acknowledgeDuplicates);
    if (result.outcome === "duplicate_suspected") {
      // 409: a human must resolve the suspected duplicate (or re-submit with
      // acknowledgeDuplicates=true). The evidence + explanation ride in the body.
      res.status(409);
      return result;
    }
    res.status(201);
    return result.company;
  }

  @Get()
  @RequirePermission("general.company.read")
  async list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw Errors.validation(
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    return this.general.listCompanies(parsed.data.limit, parsed.data.cursor);
  }
}

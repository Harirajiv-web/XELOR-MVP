import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "@ind-core/platform";
import { GeneralService } from "./general.service.js";

const createCompanySchema = z.object({
  legalName: z.string().min(1).max(200),
  cin: z.string().min(1).max(21).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

@Controller("general/companies")
export class GeneralController {
  constructor(private readonly general: GeneralService) {}

  @Post()
  async create(
    @Body() body: unknown,
    // §5.3: Idempotency-Key is required on mutating endpoints. The full replay
    // store lands with ADMINISTRATION; here we enforce the contract (presence).
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
    return this.general.createCompany(parsed.data);
  }

  @Get()
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

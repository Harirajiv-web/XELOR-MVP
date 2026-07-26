import { Global, Module } from "@nestjs/common";
import { SalesController } from "./sales.controller.js";
import { SalesService } from "./sales.service.js";
import { DEMAND_SOURCE } from "../../ports/planning-inputs.port.js";

/**
 * SMBD (MICA, Module 07) — customers, sales orders with GST, and dispatch.
 *
 * Consumes the @Global AI spine (the shared dedup brain for the customer master) and the
 * @Global STOCK_POSTER port for the goods-out movement, and ACCOUNTS_POSTER for the
 * invoice raised inside the dispatch transaction.
 *
 * It provides DEMAND_SOURCE: Sales is the origin of independent demand for the whole
 * plant, and MRP nets against the confirmed, undelivered balance of every order — with
 * the date the customer actually asked for, or an honest null where none was promised.
 */
@Global()
@Module({
  controllers: [SalesController],
  // @Global since PLANNING arrived: Sales is the origin of independent demand for the
  // whole plant, and MRP reads it through DEMAND_SOURCE without importing this module.
  providers: [SalesService, { provide: DEMAND_SOURCE, useExisting: SalesService }],
  exports: [SalesService, DEMAND_SOURCE],
})
export class SalesModule {}

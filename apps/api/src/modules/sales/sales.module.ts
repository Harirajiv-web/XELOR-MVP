import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller.js";
import { SalesService } from "./sales.service.js";

/**
 * SMBD (MICA, Module 07) — customers, sales orders with GST, and dispatch.
 *
 * Consumes the @Global AI spine (the shared dedup brain for the customer master) and the
 * @Global STOCK_POSTER port for the goods-out movement. It provides no port of its own
 * yet: nothing upstream needs to ask Sales anything. When Accounts lands, the credit
 * exposure it computes locally becomes a port instead.
 */
@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

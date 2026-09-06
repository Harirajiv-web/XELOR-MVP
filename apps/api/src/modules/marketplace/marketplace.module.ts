import { Global, Module } from "@nestjs/common";
import { MarketplaceController } from "./marketplace.controller.js";
import { SupplierPortalController } from "./supplier-portal.controller.js";
import { NetworkService } from "./network.service.js";
import { NotifyService } from "./notify.service.js";

/**
 * THE SUPPLIER NETWORK (SPAR) — taking a request out to people who do not use this ERP.
 *
 * Two controllers with DISJOINT access on purpose: staff routes behind the permission guard,
 * and the supplier's two routes behind a signed link and nothing else. They share a service
 * but no path, so a mistake on one side cannot become an exposure on the other.
 *
 * Depends on RfqService from the @Global PurchaseModule: a supplier's answer becomes an
 * ordinary sourcing quote through Purchase's own code, so every rule that already governed a
 * typed quote governs an imported one unchanged.
 */
@Global()
@Module({
  controllers: [MarketplaceController, SupplierPortalController],
  providers: [NetworkService, NotifyService],
  exports: [NetworkService, NotifyService],
})
export class MarketplaceModule {}

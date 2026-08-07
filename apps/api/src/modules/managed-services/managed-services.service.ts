import { Injectable } from "@nestjs/common";
import { managedServiceDemoSnapshot } from "@ind-core/platform";

/**
 * RELAY's MVP service view.
 *
 * The operating model is intentionally compiled and labelled as illustrative. Live
 * telemetry, pager and ITSM connectors arrive through Integration later; returning a
 * clearly bounded demonstration dataset is safer than presenting seeded records as a
 * functioning 24x7 operations centre.
 */
@Injectable()
export class ManagedServicesService {
  overview() {
    return managedServiceDemoSnapshot();
  }
}

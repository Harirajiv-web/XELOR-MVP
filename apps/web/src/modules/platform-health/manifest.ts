import type { ModuleManifest } from "@spine/registry/manifest";
import { platformHealthApi, type PlatformHealthEnvelope } from "./api";

export const platformHealthManifest: ModuleManifest = {
  key: "platform-health",
  name: "Platform Health",
  summary:
    "ACHILES privately checks whether ONYX's web application, API, database and supporting runtime are responding, then keeps a tenant-fenced history for authorised internal operators.",
  department: "ACHILES",
  icon: "Activity",
  licenceKey: "aiops",
  // Final operating agent in the sidebar, immediately after RELAY.
  order: 87,
  nav: [
    {
      label: "Private status",
      path: "status",
      permission: "platform_health.overview.read",
      icon: "HeartPulse",
      description:
        "A private internal view of the latest ACHILES availability check, component response times and recent history. Customers do not see this page; ACHILES observes and records but never changes ERP data, restarts a service or sends a customer message.",
    },
  ],
  screens: {
    status: () => import("./screens/status"),
  },
  signals: [
    {
      label: "Platform status",
      permission: "platform_health.overview.read",
      path: platformHealthApi.overviewPath,
      reduce: (raw) => {
        if (typeof raw !== "object" || raw === null) return null;
        const data = (raw as Partial<PlatformHealthEnvelope>).data;
        if (!data) return null;
        if (!data.latest) {
          return {
            value: "Waiting",
            hint: "No private check has completed yet",
            tone: "neutral",
          };
        }
        return {
          value:
            data.freshness === "stale"
              ? "Stale"
              : data.latest.overallStatus === "healthy"
                ? "Working"
                : data.latest.overallStatus === "degraded"
                  ? "At risk"
                  : "Unavailable",
          hint: `Last checked ${new Date(data.latest.completedAt).toLocaleString("en-IN")}`,
          tone:
            data.freshness === "stale"
              ? "warn"
              : data.latest.overallStatus === "healthy"
                ? "ok"
                : data.latest.overallStatus === "degraded"
                  ? "warn"
                  : "bad",
        };
      },
    },
  ],
};

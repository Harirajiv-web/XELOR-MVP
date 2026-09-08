import type { ModuleManifest } from "@spine/registry/manifest";
import { managedServicesApi, type ManagedServiceEnvelope } from "./api";

export const managedServicesManifest: ModuleManifest = {
  key: "managed-services",
  name: "Managed Services",
  summary:
    "RELAY's operating layer around XELOR: service catalogue, transition, monitoring, incidents, changes, service levels, customer updates and continual improvement.",
  department: "RELAY",
  icon: "Headset",
  // Bundled with the Agent OS entitlement in the MVP; a production commercial catalogue
  // should give Managed Services its own plan and staffing commitments.
  licenceKey: "aiops",
  order: 86,
  nav: [
    {
      label: "Service command centre",
      path: "command-centre",
      permission: "managed_services.overview.read",
      icon: "PanelsTopLeft",
      description:
        "The customer-facing operating view of XELOR itself: agreed services, current service health, active incidents, the next update and the people accountable for restoration. RELAY coordinates the service; the technical owner still fixes its own domain.",
    },
    {
      label: "Incidents & escalation",
      path: "incidents",
      permission: "managed_services.overview.read",
      icon: "Siren",
      description:
        "Operational incidents affecting the XELOR service, with severity, customer impact, response clock, technical owner, evidence and update cadence. Security incidents remain HEXA records and AI incidents remain AI Operations records; RELAY links their customer-facing impact instead of creating a second technical register.",
    },
    {
      label: "Changes & releases",
      path: "changes",
      permission: "managed_services.overview.read",
      icon: "CalendarClock",
      description:
        "One customer change calendar for planned releases and connector work. RELAY checks collisions, readiness, communication and post-change service verification; each specialist still designs and executes its own technical change.",
    },
    {
      label: "Service reviews",
      path: "reviews",
      permission: "managed_services.overview.read",
      icon: "Presentation",
      description:
        "The monthly evidence pack: service-level performance, incident and request trends, change success, risks, capacity and the agreed improvement register. Contractual credits and scope changes remain human decisions.",
    },
    {
      label: "Responsibility map",
      path: "responsibilities",
      permission: "managed_services.overview.read",
      icon: "Network",
      description:
        "The non-overlapping ownership model for RELAY, ONYX, HEXA, MICA and KILN. Every task has one accountable owner, one explicit handoff and a boundary describing what that owner cannot do.",
    },
  ],
  screens: {
    "command-centre": () => import("./screens/command-centre"),
    incidents: () => import("./screens/incidents"),
    changes: () => import("./screens/changes"),
    reviews: () => import("./screens/reviews"),
    responsibilities: () => import("./screens/responsibilities"),
  },
  signals: [
    {
      label: "Managed service",
      permission: "managed_services.overview.read",
      path: managedServicesApi.overviewPath,
      reduce: (raw) => {
        if (typeof raw !== "object" || raw === null) return null;
        const data = (raw as Partial<ManagedServiceEnvelope>).data;
        if (!data) return null;
        return {
          value:
            data.headline.servicesAtRisk === 0
              ? "Healthy"
              : `${data.headline.servicesAtRisk} at risk`,
          hint: `${data.headline.openIncidents} open incident${data.headline.openIncidents === 1 ? "" : "s"} · illustrative MVP model`,
          tone: data.headline.servicesAtRisk === 0 ? "ok" : "warn",
          fraction:
            data.headline.servicesHealthy /
            Math.max(
              1,
              data.headline.servicesHealthy + data.headline.servicesAtRisk,
            ),
        };
      },
    },
  ],
};

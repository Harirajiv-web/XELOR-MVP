import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * MAINTENANCE / CMMS (KILN, Module 10).
 *
 * `work-orders` here is the MAINTENANCE work order and shares nothing with Production's
 * manufacturing order — different table, different number series, different permission root
 * (`mnt.*` against `production.*`). The two are deliberately never joined in this UI either.
 *
 * `asset` is hidden: the 360 view of one machine, reached by clicking a row and routable at
 * `/maintenance/asset/<code>`.
 */
export const maintenanceManifest: ModuleManifest = {
  key: "maintenance",
  name: "Maintenance",
  summary: "The asset register, the work done on each machine, and the downtime it cost.",
  department: "KILN",
  icon: "Wrench",
  licenceKey: "maintenance",
  order: 60,
  nav: [
    {
      label: "Assets",
      path: "assets",
      permission: "mnt.asset.read",
      icon: "Cog",
    },
    {
      label: "Asset",
      path: "asset",
      permission: "mnt.asset.read",
      icon: "Cog",
      hidden: true,
    },
    {
      label: "Work orders",
      path: "work-orders",
      permission: "mnt.mwo.read",
      icon: "Wrench",
    },
    {
      label: "Requests",
      path: "requests",
      permission: "mnt.request.read",
      icon: "Inbox",
    },
    {
      label: "Downtime",
      path: "downtime",
      permission: "mnt.downtime.read",
      icon: "Timer",
    },
    {
      label: "Preventive schedule",
      path: "pm",
      permission: "mnt.pm.read",
      icon: "CalendarClock",
    },
    {
      label: "Reliability KPIs",
      path: "kpis",
      permission: "mnt.report.read",
      icon: "BarChart3",
    },
  ],
  screens: {
    assets: () => import("./screens/assets"),
    asset: () => import("./screens/asset"),
    "work-orders": () => import("./screens/work-orders"),
    requests: () => import("./screens/requests"),
    downtime: () => import("./screens/downtime"),
    pm: () => import("./screens/pm"),
    kpis: () => import("./screens/kpis"),
  },
};

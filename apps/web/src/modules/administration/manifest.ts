import type { ModuleManifest } from "@spine/registry/manifest";

/**
 * ADMINISTRATION (HEXA).
 *
 * The control plane: who may do what, what the law is counting down, and the evidence that
 * the record has not been edited. It sits late in the sidebar (order 100) because almost
 * nobody opens it daily — and everything in it is privileged, so almost nobody can.
 */
export const administrationManifest: ModuleManifest = {
  key: "administration",
  name: "Administration",
  summary: "Access, statutory clocks, tamper-evidence and the platform's own settings.",
  department: "HEXA",
  icon: "Settings",
  licenceKey: "administration",
  order: 100,
  nav: [
    {
      label: "Roles & access",
      path: "roles",
      permission: "admin.access.read",
      icon: "KeyRound",
    },
    {
      label: "Segregation of duties",
      path: "segregation",
      permission: "admin.access.read",
      icon: "Split",
    },
    {
      label: "Security posture",
      path: "posture",
      permission: "admin.access.read",
      icon: "ShieldCheck",
    },
    {
      label: "Security incidents",
      path: "incidents",
      permission: "admin.incident.write",
      icon: "ShieldAlert",
    },
    {
      label: "Privacy requests",
      path: "privacy",
      permission: "admin.dsr.write",
      icon: "UserCog",
    },
    {
      label: "Audit trail",
      path: "audit",
      permission: "admin.audit.read",
      icon: "ScrollText",
    },
    {
      label: "Licence & settings",
      path: "licence",
      permission: "admin.settings.write",
      icon: "BadgeCheck",
    },
  ],
  screens: {
    roles: () => import("./screens/roles"),
    segregation: () => import("./screens/segregation"),
    posture: () => import("./screens/posture"),
    incidents: () => import("./screens/incidents"),
    privacy: () => import("./screens/privacy"),
    audit: () => import("./screens/audit"),
    licence: () => import("./screens/licence"),
  },
};

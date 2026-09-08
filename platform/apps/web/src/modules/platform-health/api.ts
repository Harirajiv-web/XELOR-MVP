"use client";

import { api } from "@spine/api/client";

export type PlatformCheckStatus = "passed" | "failed" | "not_configured";
export type PlatformOverallStatus = "healthy" | "degraded" | "unavailable";

export interface PlatformCheckResult {
  key: "api" | "database" | "event_bus" | "web" | "ai_runtime";
  label: string;
  status: PlatformCheckStatus;
  required: boolean;
  latencyMs: number;
  detail: string;
}

export interface PlatformHealthResult {
  id: string;
  trigger: "hourly_schedule" | "manual";
  overallStatus: PlatformOverallStatus;
  summary: string;
  checks: readonly PlatformCheckResult[];
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface PlatformHealthOverview {
  visibility: "private_internal_only";
  schedule: { cadenceMinutes: number; mode: string };
  boundary: string;
  freshness: "current" | "stale" | "never_run";
  latest: PlatformHealthResult | null;
  history: readonly PlatformHealthResult[];
}

export interface PlatformHealthEnvelope {
  data: PlatformHealthOverview;
}

export const platformHealthApi = {
  overviewPath: "/platform-health/overview",
  runPath: "/platform-health/run",
  run: () => api.post<{ data: PlatformHealthResult }>("/platform-health/run", {}),
} as const;

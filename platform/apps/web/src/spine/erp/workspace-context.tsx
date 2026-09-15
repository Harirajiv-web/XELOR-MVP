"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { orderedModules } from "@modules/registry";
import { useAccess } from "../access/permissions";
import { api } from "../api/client";
import { canOpenNavEntry, moduleAvailability } from "../registry/manifest";
import { DEFAULT_CONFIG, ERP_ACTIONS, ROLES, type FocusRole, type WorkspaceConfig, type WorkspaceConfiguration, type ErpAction } from "./workspace-model";

interface WorkspaceContextValue {
  config: WorkspaceConfig; updatedAt: string | null; loading: boolean; error: string | null;
  role: FocusRole; setRole: (role: FocusRole) => void; reload: () => void;
  save: (config: WorkspaceConfig) => Promise<void>; actions: readonly ErpAction[];
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function ErpWorkspaceProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { ready, identity, can, isLicensed } = useAccess();
  const [record, setRecord] = useState<WorkspaceConfiguration>({ config: DEFAULT_CONFIG, updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [role, setFocusRole] = useState<FocusRole>("owner");
  const storageKey = identity ? `xelor.erp2.focus.v1:${identity.tenantId}:${identity.subject}` : null;
  useEffect(() => {
    setFocusRole("owner");
    if (!storageKey) return;
    try { const saved = localStorage.getItem(storageKey); if (ROLES.some(entry => entry.id === saved)) setFocusRole(saved as FocusRole); } catch { /* Session use remains available without browser storage. */ }
  }, [storageKey]);
  const setRole = useCallback((next: FocusRole) => {
    setFocusRole(next);
    if (storageKey) { try { localStorage.setItem(storageKey, next); } catch { /* Keep the focus for this session. */ } }
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    if (!can("general.company.read")) { setRecord({ config: DEFAULT_CONFIG, updatedAt: null }); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    void api.get<WorkspaceConfiguration>("/general/workspace-config", { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setRecord(value); setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setError("Company layout could not be loaded. The standard workspace is available; retry before changing company settings."); setLoading(false);
    });
    return () => controller.abort();
  }, [ready, can, nonce, identity?.tenantId]);
  const actions = useMemo(() => {
    const modules = orderedModules().filter(module => moduleAvailability(module, { can, isLicensed }) === null);
    return ERP_ACTIONS.filter(action => {
      const [, key, path] = action.href.split("/");
      const module = modules.find(entry => entry.key === key);
      const nav = module?.nav.find(entry => entry.path === path);
      return nav !== undefined && canOpenNavEntry(nav, can);
    });
  }, [can, isLicensed]);
  const save = useCallback(async (config: WorkspaceConfig) => {
    const saved = await api.post<WorkspaceConfiguration>("/general/workspace-config", config);
    setRecord(saved); setError(null);
  }, []);
  return <WorkspaceContext.Provider value={{ config: record.config, updatedAt: record.updatedAt, loading, error, role, setRole, reload: () => setNonce(value => value + 1), save, actions }}>{children}</WorkspaceContext.Provider>;
}
export function useErpWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("ERP workspace provider is required");
  return value;
}

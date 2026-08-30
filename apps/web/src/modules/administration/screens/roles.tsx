"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { humanise, num } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { DataEnvelope, RoleRow } from "../api";
import { administrationApi } from "../api";

/**
 * ROLES & ACCESS — the list an access review is done from.
 *
 * Two numbers are the point of the table and they are deliberately side by side: how many
 * permissions a role carries, and how many people hold it. A role with forty permissions
 * and one holder is a person nobody can cover for; a role with four permissions and
 * twenty-two holders is a role that was granted because it was easiest.
 */
export default function RolesScreen(_props: ScreenProps): React.JSX.Element {
  const { data, loading, error, reload } = useQuery<DataEnvelope<RoleRow>>(
    administrationApi.rolesPath,
  );
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q),
    );
  }, [data, filter]);

  const all = data?.data ?? [];
  const privileged = all.filter((r) => r.isPrivileged).length;

  const columns: ReadonlyArray<Column<RoleRow>> = [
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.name}</div>
          <div className="truncate font-[var(--font-mono)] text-[12px] text-[var(--text-secondary)]">
            {r.code}
          </div>
        </div>
      ),
    },
    {
      key: "description",
      header: "What it is for",
      render: (r) => (
        <span className="text-[var(--text-secondary)]">{r.description ?? "—"}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "w-36",
      // A category is a grouping, not a workflow state, so it gets the neutral treatment.
      // Borrowing the eight status colours here would teach that green means "safe".
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.category)} />,
    },
    {
      key: "reach",
      header: "Reach",
      width: "w-56",
      // Two separate facts that are usually confused: "privileged" is about what the role
      // may DO, "sees every plant" is about which ROWS it may do it to. A role can be one
      // without the other, and an access review that conflates them misses half the risk.
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.isPrivileged ? <StatusBadge tone="pending" label="Privileged" /> : null}
          {r.isRowUnrestricted ? <StatusBadge tone="overdue" label="Every plant" /> : null}
          {!r.isPrivileged && !r.isRowUnrestricted ? (
            <span className="text-[var(--text-secondary)]">Scoped</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "permissionCount",
      header: "Permissions",
      numeric: true,
      width: "w-32",
      render: (r) => num(r.permissionCount),
    },
    {
      key: "holderCount",
      header: "People",
      numeric: true,
      width: "w-28",
      // Zero holders is worth seeing rather than hiding: an unheld role is either a gap in
      // cover or a role somebody defined and forgot, and both need a decision.
      render: (r) =>
        r.holderCount === 0 ? (
          <span className="text-[var(--text-muted)]">0</span>
        ) : (
          <span className="font-semibold">{num(r.holderCount)}</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Roles & access"
        subtitle="Every role this company has defined, what it can do, and how many people hold it. Nobody is given a permission directly — access always arrives through a role, so this list is the whole of who can do what."
        meta={
          all.length > 0
            ? [
                { label: "Roles", value: String(all.length) },
                { label: "Privileged", value: String(privileged) },
              ]
            : []
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by role or category…"
          aria-label="Filter roles"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface-data)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        error={error}
        onReload={reload}
        rowKey={(r) => r.code}
        caption="Roles, their reach, and how many people hold each"
        empty={
          filter ? (
            <Empty
              title="Nothing matches that filter"
              body={`No role name, code or category matched “${filter}”.`}
            />
          ) : (
            <Empty
              title="No roles defined"
              body="Roles appear here once the access model is loaded. Until one exists nobody can open anything, including this screen."
            />
          )
        }
      />
    </div>
  );
}

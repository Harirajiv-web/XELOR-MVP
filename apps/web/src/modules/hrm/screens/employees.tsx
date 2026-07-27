"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCursorList } from "@spine/data/use-query";
import { DataTable, type Column } from "@spine/data/data-table";
import { Empty } from "@spine/states";
import { date, humanise } from "@spine/format";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import type { EmployeeRow } from "../api";
import { hrmApi } from "../api";

/**
 * EMPLOYEES — the master every other People screen resolves a person against.
 *
 * Cursor-paged, never offset: people are being hired while somebody is reading this list,
 * and an offset page two would silently skip whoever was inserted above it.
 *
 * Filtering is CLIENT-SIDE, like Stock on hand, and that has a limit worth stating: it
 * narrows THE ROWS ALREADY LOADED. For a plant's headcount that is the whole master and the
 * filter is instant where a round trip per keystroke is not; past a few pages it becomes a
 * query parameter, and the change is contained to this file because nothing else knows how
 * the filter works.
 */
export default function EmployeesScreen(_props: ScreenProps): React.JSX.Element {
  const router = useRouter();
  const { rows: loaded, loading, loadingMore, error, hasMore, loadMore, reload } =
    useCursorList<EmployeeRow>(hrmApi.employeesPath, { limit: 50 });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return loaded;
    return loaded.filter(
      (r) =>
        r.empCode.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q) ||
        (r.designation ?? "").toLowerCase().includes(q),
    );
  }, [loaded, filter]);

  const columns: ReadonlyArray<Column<EmployeeRow>> = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text-primary)]">{r.empCode}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">{r.name}</div>
        </div>
      ),
    },
    {
      key: "placement",
      header: "Department",
      width: "w-56",
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.department ?? "—"}</div>
          <div className="truncate text-[12px] text-[var(--text-secondary)]">
            {r.designation ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "employmentType",
      header: "Employment",
      width: "w-40",
      // Employment type is a contractual fact, not a workflow state, so it gets the
      // neutral treatment — borrowing the status colours would teach that "permanent" is
      // approved and "contract" is on hold.
      render: (r) => <StatusBadge tone="unknown" label={humanise(r.employmentType)} />,
    },
    {
      key: "doj",
      header: "Joined",
      width: "w-32",
      render: (r) => <span className="text-[var(--text-secondary)]">{date(r.dateOfJoining)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-32",
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employees"
        subtitle="The employee master. Personal identifiers — PAN, Aadhaar, bank account — are never shown in a list; open a person to see how they are held."
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
          placeholder="Filter by code, name or department…"
          aria-label="Filter employees"
          className="h-9 w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] pl-8 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReload={reload}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/hrm/employee/${r.id}`)}
        caption="Employees on roll, with placement and employment type"
        empty={
          filter ? (
            <Empty
              title="Nobody matches that filter"
              // Said plainly, because the filter searches what has been LOADED. Somebody
              // hunting for a person who is on page three would otherwise conclude the
              // company has never heard of them.
              body={
                hasMore
                  ? `No employee code, name or department loaded so far matched “${filter}”. There are more pages — clear the filter and load them to search further.`
                  : `No employee code, name or department matched “${filter}”.`
              }
            />
          ) : (
            <Empty
              title="No employees on roll"
              body="The master fills once employees are created — by hand, or from the joining register your office already keeps."
            />
          )
        }
      />
    </div>
  );
}

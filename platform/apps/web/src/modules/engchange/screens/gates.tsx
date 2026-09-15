"use client";

import { useMemo, useState } from "react";
import { CircleSlash, Info, ListChecks, TriangleAlert } from "lucide-react";
import { useCursorList, useQuery } from "@spine/data/use-query";
import { Empty, ErrorState } from "@spine/states";
import { date, humanise, qty as fmtQty } from "@spine/format";
import { useAccess } from "@spine/access/permissions";
import { PageHeader } from "@spine/shell/page-header";
import { StatusBadge } from "@spine/ui/status-badge";
import type { ScreenProps } from "@spine/registry/manifest";
import {
  engChangeApi,
  isSettledStatus,
  type BomEditPolicy,
  type BomView,
  type ItemRow,
  type PlanningPolicyRow,
  type ProductionOrderRow,
  type StockRow,
} from "../api";

/**
 * INTRODUCTION GATES — a checklist over real records, and NOT a record itself.
 *
 * ============================================================================
 * READ THIS BEFORE BELIEVING ANYTHING ON THIS SCREEN
 * ============================================================================
 *
 * NOTHING HERE IS SAVED. There is no stage-gate table in this system, no gate status column,
 * no owner field, no sign-off, no gate date and no evidence attachment. A gate therefore
 * cannot be passed, failed, assigned, dated or reopened, and this screen offers no control
 * that appears to do any of those things.
 *
 * What it does instead is READ the records that would evidence each stage and report what
 * they show. A gate is "evidenced" when the record that proves it exists, and "not evidenced"
 * when it does not. That is a reading of the system's state, not a decision anybody made, and
 * the difference is stated in the interface rather than left for the user to work out.
 *
 * Why build it at all, then? Because the reading is genuinely useful and completely honest. A
 * new part that has an item master row, no bill of material, and a production order raised
 * against it anyway is a real problem visible in about two seconds here and in about two
 * weeks otherwise. The checklist finds that; it just cannot sign anything off.
 *
 * ============================================================================
 * WHAT THIS IS NOT, AND WILL NOT BECOME HERE
 * ============================================================================
 *
 * NOT APQP, AND NOT PPAP. Those are real, specific, auditable packages with segment-specific
 * content — an automotive PPAP is not an aerospace first-article and neither is a general
 * NPI checklist. They belong to a partner with the domain knowledge and the customer
 * relationships, not to this module, and a four-box approximation of one branded with its
 * name would be worse than not having it: somebody would show it to a customer auditor.
 *
 * NOT PLM. No CAD, no drawing vault, no document control, no part-numbering scheme, no
 * release workflow.
 *
 * The four stages below are the plain-language ones a plant actually uses — concept,
 * feasibility, prototype, production release — deliberately named in ordinary words so nobody
 * mistakes them for a standard's terminology.
 */

/* -------------------------------------------------------------------------- */
/* What a gate is                                                             */
/* -------------------------------------------------------------------------- */

interface EvidenceLine {
  label: string;
  /** The record itself, named so it can be checked. Null when there is no record. */
  detail: string | null;
}

interface Gate {
  key: string;
  name: string;
  /** What this stage means in a plant, in one sentence. */
  meaning: string;
  /** What the system would have to contain for this stage to be evidenced. */
  looksFor: string;
  evidenced: boolean;
  /** Null when a permission, not an absence, is why this gate cannot be assessed. */
  assessable: boolean;
  evidence: readonly EvidenceLine[];
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function GatesScreen(_props: ScreenProps): React.JSX.Element {
  const { can } = useAccess();
  const canBom = can("engineering.bom.read");
  const canPolicy = can("planning.policy.read");
  const canProduction = can("production.order.read");
  const canStock = can("inventory.stock.read");

  const items = useCursorList<ItemRow>(engChangeApi.itemsPath, {
    limit: engChangeApi.pageSize,
  });
  const policies = useQuery<{ data?: PlanningPolicyRow[] }>(
    canPolicy ? engChangeApi.policiesPath : null,
  );
  const production = useCursorList<ProductionOrderRow>(
    canProduction ? engChangeApi.productionOrdersPath : null,
    { limit: 100 },
  );

  const [selectedId, setSelectedId] = useState("");

  // Only parts this factory MAKES have an introduction to gate. A bought part has no
  // prototype and no production release; offering it here would produce four empty boxes and
  // invite the reader to conclude something is missing when nothing is.
  const madeItems = useMemo(
    () => items.rows.filter((row) => row.itemType === "finished_good" || row.itemType === "sub_assembly"),
    [items.rows],
  );
  const selected = madeItems.find((row) => row.id === selectedId) ?? madeItems[0];

  const bom = useQuery<BomView>(
    canBom && selected?.defaultBomId ? engChangeApi.bomPath(selected.defaultBomId) : null,
  );
  const bomPolicy = useQuery<BomEditPolicy>(
    canBom && selected?.defaultBomId ? engChangeApi.bomEditPolicyPath(selected.defaultBomId) : null,
  );
  const stock = useQuery<StockRow[]>(canStock && selected ? engChangeApi.stockPath : null, {
    query: { itemId: selected?.id },
  });

  const policy = (policies.data?.data ?? []).find((row) => row.itemId === selected?.id) ?? null;
  const ownOrders = useMemo(
    () => (selected ? production.rows.filter((row) => row.itemId === selected.id) : []),
    [selected, production.rows],
  );
  const completedOrders = ownOrders.filter((row) => isSettledStatus(row.status) && row.status !== "cancelled");
  const stockRows = stock.data ?? [];
  const stockTotal = stockRows.reduce((total, row) => total + Number(row.qty), 0);

  const gates: readonly Gate[] = useMemo(() => {
    if (!selected) return [];
    return [
      {
        key: "concept",
        name: "Concept",
        meaning: "The part exists as an idea somebody has written down, with a code the plant can refer to it by.",
        looksFor: "A row in the item master.",
        evidenced: true,
        assessable: true,
        evidence: [
          { label: "Item master", detail: `${selected.itemCode} — ${selected.name}` },
          { label: "Added", detail: date(selected.createdAt) },
          {
            label: "Type and unit",
            detail: `${humanise(selected.itemType)}, measured in ${selected.uom}`,
          },
          {
            label: "Standard cost",
            detail: selected.standardCost === null ? null : `${selected.standardCost} per ${selected.uom}`,
          },
        ],
      },
      {
        key: "feasibility",
        name: "Feasibility",
        meaning: "Somebody has decided how it will be made and how it will be replenished — a recipe, and a plan for getting its parts.",
        looksFor: "A bill of material, and a planning policy saying how the part is replenished.",
        evidenced: selected.bomCount > 0 && policy !== null,
        assessable: canBom && canPolicy,
        evidence: [
          {
            label: "Bill of material",
            detail: bom.data
              ? `Version ${bom.data.version}, ${bom.data.lines.length} component line(s), makes ${bom.data.outputQty} ${bom.data.uom} per run`
              : selected.bomCount > 0
                ? `${selected.bomCount} live bill(s) — not read`
                : null,
          },
          {
            label: "Planning policy",
            detail: policy
              ? `${humanise(policy.planningMethod)}, ${humanise(policy.sourceType)}, lead time ${policy.leadTimeWorkingDays} working day(s), level ${policy.lowLevelCode}`
              : null,
          },
          {
            label: "Lot rule",
            detail: policy ? `${humanise(policy.lotRule)}${policy.lotSize ? ` of ${policy.lotSize}` : ""}` : null,
          },
        ],
      },
      {
        key: "prototype",
        name: "Prototype",
        meaning: "One has actually been made — the recipe has met the shop floor and survived the meeting.",
        looksFor: "At least one production order raised for this part.",
        evidenced: ownOrders.length > 0,
        assessable: canProduction,
        evidence: [
          {
            label: "Production orders raised",
            detail: ownOrders.length === 0 ? null : `${ownOrders.length} order(s)`,
          },
          {
            label: "First one",
            detail: (() => {
              const first = [...ownOrders].sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];
              return first
                ? `${first.orderNo} for ${fmtQty(first.qtyToProduce, first.uom)}, raised ${date(first.createdAt)}, now ${humanise(first.status)}`
                : null;
            })(),
          },
          {
            label: "Revision it was built to",
            detail: (() => {
              const first = [...ownOrders].sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];
              // The pinned bill id, not the version: resolving the version needs a separate
              // read per order, which the Revisions screen does properly. Naming the id here
              // is honest about what this screen knows.
              return first ? `Pinned to bill ${first.bomId.slice(0, 8)}… — see Revisions for the version` : null;
            })(),
          },
        ],
      },
      {
        key: "release",
        name: "Production release",
        meaning: "It is a normal product: the recipe is the live one, builds have been finished to it, and there is finished stock.",
        looksFor: "A live bill of material, at least one finished production order, and stock on hand.",
        evidenced:
          bomPolicy.data?.status === "active" && completedOrders.length > 0 && stockTotal > 0,
        assessable: canBom && canProduction && canStock,
        evidence: [
          {
            label: "Current bill is live",
            detail: bomPolicy.data
              ? `Version ${bomPolicy.data.version} is ${humanise(bomPolicy.data.status)}`
              : null,
          },
          {
            label: "Finished builds",
            detail:
              completedOrders.length === 0
                ? null
                : `${completedOrders.length} order(s) finished — latest ${
                    [...completedOrders].sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0]?.orderNo ?? ""
                  }`,
          },
          {
            label: "Finished stock on hand",
            detail: stockTotal > 0 ? `${fmtQty(stockTotal, selected.uom)} across ${stockRows.length} balance row(s)` : null,
          },
        ],
      },
    ];
  }, [
    selected,
    policy,
    bom.data,
    bomPolicy.data,
    ownOrders,
    completedOrders,
    stockRows.length,
    stockTotal,
    canBom,
    canPolicy,
    canProduction,
    canStock,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Introduction gates"
        subtitle="A four-stage reading of how far a new part has got, evidenced by the records that actually exist. Nothing on this screen is saved."
      />

      <div className="x-notice" data-tone="warning">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p>
            <strong>No gate here can be signed off, assigned or dated.</strong> There is no
            stage-gate table in this system and no owner field anywhere in it, so there is nothing
            to record a sign-off in and nobody to record it against. Every stage below is a
            READING of the records, recomputed each time this screen opens.
          </p>
          <p className="mt-1.5">
            An owner column is absent rather than empty, for the same reason a blank column is
            worse than a missing one: a blank invites somebody to try to fill it in.
          </p>
        </div>
      </div>

      <section className="x-home-panel">
        <div className="x-home-panel-head flex-wrap gap-3">
          <div>
            <h2 className="x-section-heading">Choose a part being introduced</h2>
            <p>
              Only parts this factory makes are listed. A bought part has no prototype and no
              production release.
            </p>
          </div>
          {madeItems.length > 0 ? (
            <label className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-secondary)]">
              Part
              <select
                aria-label="Choose a part to read its introduction gates"
                className="h-10 max-w-full rounded-[var(--radius-control)] border border-[var(--border-input)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {madeItems.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.itemCode} · {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {items.error ? (
          <div className="p-5">
            <ErrorState error={items.error} onRetry={items.reload} />
          </div>
        ) : items.loading ? (
          <p className="p-5 text-[13px] text-[var(--text-secondary)]" role="status">
            Loading the part list…
          </p>
        ) : madeItems.length === 0 ? (
          <div className="p-5">
            <Empty
              title="No part is made here yet"
              body="Introduction gates apply to finished goods and sub-assemblies. Once the item master has one, it appears in this selector."
            />
          </div>
        ) : null}
      </section>

      {selected ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {gates.map((gate, index) => (
              <GateCard key={gate.key} gate={gate} index={index} />
            ))}
          </div>

          <div className="x-notice">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p>
                <strong>This is not APQP and it is not PPAP.</strong> Those are specific, auditable
                packages whose content differs by industry, and they belong to a partner with the
                domain knowledge — not to a four-box approximation in a general ERP. The stages
                above are deliberately named in plain words so nobody mistakes them for a
                standard&rsquo;s terminology.
              </p>
              <p className="mt-1.5">
                Nor is it product lifecycle management. There is no drawing vault, no document
                control and no part-numbering scheme here.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One gate                                                                   */
/* -------------------------------------------------------------------------- */

function GateCard({ gate, index }: { gate: Gate; index: number }): React.JSX.Element {
  return (
    <section className="x-home-panel">
      <div className="x-home-panel-head flex-wrap gap-3">
        <div>
          <h2 className="x-section-heading">
            {index + 1}. {gate.name}
          </h2>
          <p>{gate.meaning}</p>
        </div>
        {!gate.assessable ? (
          <StatusBadge tone="unknown" label="Cannot check" />
        ) : gate.evidenced ? (
          <StatusBadge tone="approved" label="Evidence found" />
        ) : (
          <StatusBadge tone="draft" label="No evidence yet" />
        )}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-[11px] leading-[1.7] text-[var(--text-muted)]">
          <strong>Looks for:</strong> {gate.looksFor}
        </p>

        {!gate.assessable ? (
          <p className="text-[13px] text-[var(--text-secondary)]">
            Some of the records this stage reads are outside your permissions, so its state is
            unknown rather than absent. Do not read the badge as a finding.
          </p>
        ) : null}

        <dl className="flex flex-col gap-2">
          {gate.evidence.map((line) => (
            <div key={line.label} className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
                {line.label}
              </dt>
              <dd className="text-[12.5px] text-[var(--text-primary)]">
                {line.detail ?? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                    <CircleSlash className="h-3 w-3" aria-hidden />
                    No such record
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="flex items-start gap-1.5 text-[11px] leading-[1.7] text-[var(--text-muted)]">
          <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Read from live records. Not signed off, not dated, and not assigned to anyone — there is
          nowhere in this system to store any of those.
        </p>
      </div>
    </section>
  );
}

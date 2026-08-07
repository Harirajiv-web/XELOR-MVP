# XELOR agent guides

This guide set explains the implemented XELOR agent system in plain language. It is
based on the runtime types, capability registry, graph catalogue, graph engine, action
dispatch service, Decision Commander, AI spine, domain modules, database migrations,
tests and product documentation in this repository.

The PDFs are generated into [`docs/05-deliverables/agent-guides/`](../05-deliverables/agent-guides/):

1. `00_XELOR_AGENT_SYSTEM_MASTER_GUIDE.pdf` — the overall product, short agent
   summaries, architecture blocks, coordination model, human-control boundary and
   implementation truth.
2. `01_ONYX_AGENT_GUIDE.pdf` — supervisor and mission coordination.
3. `02_HEXA_AGENT_GUIDE.pdf` — governance, permissions, approvals and audit.
4. `03_MICA_AGENT_GUIDE.pdf` — customer commitments, Sales and manufactured-product Customer Care & Warranty.
5. `04_SPAR_AGENT_GUIDE.pdf` — procurement, inventory and material availability.
6. `05_AXLE_AGENT_GUIDE.pdf` — Engineering, MRP and planning.
7. `06_KILN_AGENT_GUIDE.pdf` — production, quality, audit and maintenance.
8. `07_RASP_AGENT_GUIDE.pdf` — Accounts, working capital, spend and payroll.
9. `08_RELAY_AGENT_GUIDE.pdf` — the managed-service lifecycle, service desk,
   incidents, changes, service levels, customer communication and improvement, with the
   exact boundary between coordination and specialist technical ownership.
10. `09_ACHILES_AGENT_GUIDE.pdf` — private platform-health checks, evidence history,
    escalation boundaries and the separation between assurance and business decisions.

Editable HTML is stored under [`docs/reports/agent-guides/`](../reports/agent-guides/).
Regenerate every HTML/PDF file from the version-controlled source with:

```bash
pnpm --filter @ind-core/web render-agent-guides
```

The renderer fails if a designed page overflows its A4 boundary. It also writes selected
proof screenshots under `apps/web/test-results/agent-guide-proofs/` for local visual
inspection; that test-output folder is intentionally not committed.

## Important interpretation

An agent's **product grouping** is the wider business area it represents. Its
**capability list** is the smaller, exact set of operations that Agent OS can call today.
The PDFs keep these separate so a reader does not mistake product ownership for runtime
authority.

The current runtime disclosure is intentionally explicit: orchestration, ERP reads,
approval gates and governed action dispatch are live. Language reasoning is
deterministic; no external model API or connector is active.

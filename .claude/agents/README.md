# Department agents

Seven agents, one per department in `NAME.md`. Each carries its department's system-of-record
ownership, the cross-department treaties it must honour, and the parts of `DECISIONS-V2.md`
it is not allowed to drift from.

| Agent | Department | Blueprints | Invoke with |
|---|---|---|---|
| **HEXA** | Platform & Governance | `GENERAL.md` · `ADMINISTRATION.md` · `INTEGRATION.md` | `hexa` |
| **MICA** | Commercial | `SMBD.md` · `CSP.md` | `mica` |
| **SPAR** | Supply Chain | `PURCHASE.md` · `INVENTORY.md` | `spar` |
| **AXLE** | Product Engineering & Planning | `ENGINEERING.md` · `PLANNING.md` | `axle` |
| **KILN** | Manufacturing Operations | `PRODUCTION.md` · `INSPECTION.md` · `MAINTENANCE.md` | `kiln` |
| **RASP** | People & Money | `HRM-ATTENDANCE.md` · `EXPENDITURE.md` · `ACCOUNTS.md` | `rasp` |
| **ONYX** | AI Operations *(component)* | `AI-OPERATIONS.md` | `onyx` |

## Why they exist

Departments are cut by **system-of-record ownership**, not by convenience. Each blueprint's
own "Module boundary — touchpoints only" table already encodes those lines; these agents
make them operational, so a change lands with the department that owns the data rather than
with whoever happened to open the file.

The practical effect: an agent asked to do something outside its ownership says so and
names the department that owns it, instead of quietly reaching across a boundary. That is
the same rule `eslint-plugin-boundaries` enforces in code, applied to the people — and to
the agents — doing the work.

## Rules every one of them carries

- `DECISIONS-V2.md` is binding and wins on any conflict with a module blueprint. Cite the §
  being implemented; diverge only through an ADR reviewed by HEXA.
- The locked stack is not re-openable. No module starts on FastAPI or PostgreSQL 16.
- The research and blueprint documents under `E:\ERP` are a **read-only golden snapshot**.
- `POST /api/stock/entries` is the single write path to the stock ledger. Only SPAR owns it.
- AI explains, never decides. Code produces the verdict; the model produces the wording.
- Every statutory number is configuration, never a constant in code.
- Explain the work in plain language — the founder is non-technical.

**SPAR and RASP are anagrams.** This was accepted knowingly, with one mitigation: neither is
ever abbreviated, in code, package names, branch names, ticket titles or conversation.
Always the full four letters.

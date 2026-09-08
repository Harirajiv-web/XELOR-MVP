# XELOR — Technology stack and architecture

*India-first, AI-native manufacturing ERP for MSMEs. Stack is normative per
`DECISIONS-V2.md` §2 + Appendix A (pinned July 2026); every choice survived an
adversarial "disproof" review (0 of 14 recommendations overturned). Region: **AWS
ap-south-1 (Mumbai)**, DR **ap-south-2 (Hyderabad)**.*

Legend — **Live** = wired & verified in the prototype · **Planned** = decided/pinned, not yet built.

## Language & runtime
| Component | Choice | Version | Status |
|---|---|---|---|
| Runtime | Node.js (LTS) | 22 | Live |
| Language | TypeScript | 5.7 | Live |
| Package manager | pnpm workspaces (monorepo) | 9 | Live |
| Compiler / build | SWC (via `@swc/core`, Nest CLI) | 1.9 | Live |

## Backend
| Component | Choice | Version | Status |
|---|---|---|---|
| API framework | NestJS (modular monolith) | v11 | Live |
| HTTP layer | Express (via `@nestjs/platform-express`) | 5 | Live |
| Validation | Zod | 3.x | Live |
| JWT / OIDC verification | jose (JWKS signature verify) | 5.x | Live |

## Database & data layer
| Component | Choice | Version | Status |
|---|---|---|---|
| Database | PostgreSQL | 17 | Live |
| Vector search | pgvector (on PG17) | latest | Live (extension enabled) |
| Full-text / fuzzy | `pg_trgm` (trigram similarity) | built-in | Live |
| ORM / migrations | Drizzle ORM + drizzle-kit | v1 (0.36.x) | Live |
| Multi-tenancy | Pooled shared-schema + **FORCE Row-Level Security**, non-owner `app_user` role | — | Live |
| Primary keys | UUIDv7 everywhere | — | Live |

## Caching, queue & eventing
| Component | Choice | Version | Status |
|---|---|---|---|
| Cache / broker | Valkey (BSD Redis fork) | 8 | Live |
| Job queue | BullMQ | 5.x | Live |
| Redis client | ioredis | 5.x | Live |
| Event delivery | Transactional outbox (Postgres) → Valkey/BullMQ relay; at-least-once + idempotent consumers ⇒ **exactly-once effect** | — | Live |

## Identity & access
| Component | Choice | Version | Status |
|---|---|---|---|
| Identity provider | Keycloak (self-hosted, ap-south-1), **Organizations** for B2B tenant separation | 26 | Live (OIDC) |
| AuthN | OIDC; tenant derived from JWKS-verified token claim (never a header) | — | Live |
| AuthZ | In-app RBAC (roles/permissions); ABAC row/field scoping planned | — | Live (RBAC) |

## AI layer (governed, evidence-grounded, approval-gated)
| Component | Choice | Status |
|---|---|---|
| Router | Provider-agnostic **thin** router (`completion(task, schema)`), small-model default / Claude premium tier | Live |
| Providers | Offline deterministic **stub** (zero-cost dev) → OpenAI / Gemini / Claude adapters by config | Live (stub) |
| Feature registry | **Closed set of 8 features**, keyed by `feature_key`; unregistered → rejected at runtime | Live |
| Governance | `AiGovernancePort` — opt-out, token budget, kill switch, consent | Planned (A2) |
| Audit | Hash-chained, append-only `ai_action_log` (every call logged) | Live |
| Ship gate | Golden-set eval harness — a feature must beat its deterministic baseline before shipping | Planned (A3) |
| Posture | "AI explains; it never decides" — drafts for human approval, cites source rows, never writes autonomously | Binding |

## Frontend (planned)
| Component | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| UI runtime | React | 19 |
| Components | shadcn/ui (Radix + Tailwind) | latest |

## Documents, storage & PDF
| Component | Choice | Version | Status |
|---|---|---|---|
| HTML→PDF | Gotenberg (headless Chromium) | 8 | Planned (container pinned) |
| Object storage | Amazon S3 (ap-south-1) | — | Planned |

## Infrastructure, IaC & CI/CD
| Component | Choice | Status |
|---|---|---|
| Cloud | AWS ap-south-1 (Mumbai), DR ap-south-2 | Planned |
| IaC | OpenTofu (native state encryption) | Planned |
| CI verification | GitHub Actions (static/schema/report proofs, clean images, public-demo acceptance/browser smoke) | Live |
| Production delivery | GitHub Actions with cloud OIDC, artifact signing, promotion and rollback | Planned |
| Local dev infra | Docker Compose (PG17 · Valkey · Keycloak · Gotenberg) | Live |
| Module-boundary enforcement | `eslint-plugin-boundaries` (fails CI on cross-module deep imports) | Live |

## Observability & compliance
| Component | Choice | Status |
|---|---|---|
| Tracing/metrics | OpenTelemetry | Planned |
| Dashboards | Grafana (Cloud) | Planned |
| Error tracking | Sentry | Planned |
| Audit trail | Hash-chained, append-only, 8-year (MCA Rule 11(g)), non-disableable | Live |
| Regulatory | DPDP Act 2023, CERT-In directions, GST (e-invoice/e-way, 1-Aug-2026 Ship-to-GSTIN), payroll statutory | Binding facts (§3) |

## Architecture & cross-cutting patterns
- **Factory Connect edge boundary** — additive tenant-scoped operational evidence for gateways, robot/AMR assets, state/location and material dwell; a simulator-only edge runtime ships in the MVP. Production OPC UA, MQTT, ROS 2, Cisco Spaces and Splunk adapters require mutual authentication and site acceptance. Robot controllers, safety PLCs, interlocks and emergency stops remain locally authoritative.
- **Boundary-enforced modular monolith** — one deployable, one DB; each ERP domain is one module; cross-module access only via service interfaces or outbox events (no hard FK across a boundary), enforced in CI.
- **Belt-and-braces tenancy** — app-layer tenant context (AsyncLocalStorage) + `SET LOCAL app.current_tenant` per transaction + FORCE RLS as the fail-closed backstop.
- **Tamper-evidence** — per-tenant hash chains on the audit log, the approval trail, and the AI log.
- **W1 approval engine** behind a `WorkflowExecutor` port (versioned templates, role/user approver resolution, SLA timers; documented exit to Temporal).
- **Safety rules** — ledger-critical writes stay synchronous in one transaction (never on the bus); a single write path to stock; `Idempotency-Key` on all mutations; canonical error envelope; cursor pagination only.

## Explicitly rejected (do not re-choose)
FastAPI / Python backend · PostgreSQL 16 · Auth.js (can't carry orgs/SAML/LDAP/residency) · Temporal/Camunda/Step Functions as the MVP workflow engine · Frappe as the build platform · a "fat" capability-abstracting AI gateway · autonomous AI agents with write access.

---
*Generated 2026-07-24 from DECISIONS-V2 (binding baseline) + the running prototype.*

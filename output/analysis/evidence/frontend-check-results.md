# Frontend audit — 11 September 2026

Scope: C:/ORGANISED/XELOR-MVP (current checkout), with read-only source inspection of C:/ORGANISED/AIKYANTRA at 2e4490b on local/four-products. No application source edits, migrations, seeders, resets, builds or external messages were performed. The following are transcribed completed command results; silent successes are explicitly marked. The detailed technical-report checker output is captured separately.

## Fresh checks in XELOR-MVP

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @ind-core/web exec tsc --noEmit --incremental false` | 0 | Passed; no stdout/stderr |
| `pnpm --filter @ind-core/web lint` | 0 | `eslint src --max-warnings=0`; no diagnostics |
| `pnpm --filter @ind-core/web test` | 0 | 63 tests passed; 0 failed, cancelled, skipped or todo; duration_ms 17725.031 |
| `node apps/web/scripts/validation/check-module-manifests.mjs` | 0 | `Module check OK — 25 module(s) installed and registered; 58 nav permission(s) all defined by the platform; no cross-module imports.` |
| `node apps/web/scripts/validation/check-demo-upgrade-manifest.mjs` | 0 | `Demo upgrade manifest OK - 8 workstreams, 36 proposed paths, and all current-path/disclosure checks passed.` |
| `node apps/web/scripts/validation/check-business-revenue-model.mjs` | 0 | `Business revenue model v3.1 verified: ₹18L MSME ACV, ₹54L Multi-Plant ACV, ₹18,727.2Cr TAM, 35 break-even customers at the month-18 cost base and 83 at the Year-3 base, 15 employees, 9 agent prices, 21 sources; price decision HOLD.` |
| `node apps/web/scripts/validation/check-technical-report-facts.mjs` | 1 | `Technical report fact check FAILED — 54 problem(s):`; complete diagnostics in technical-report-facts-output.txt |

The four inexpensive validators were first run sequentially in one shell. Individual successes printed their OK lines; the final facts validator returned 1. The facts validator was repeated only to preserve its full output. Test/typecheck/lint suites were not repeated. Environment used Node v24.11.0; CI declares Node22.

## Interpretation of facts-check failure

- It blocks the checked-out CI workflow: `.github/workflows/ci.yml:118` runs `pnpm report-data-check`.
- Clear source/report drift: `apps/web/scripts/render-agent-guides.mjs:36` hardcodes 19 capabilities and 7 graphs; implementation-derived checker counts 20 and 8. Several architecture reports use 33 controllers against the checker inventory of 34.
- Render manifest coverage is incomplete: `docs/reports/project-report-render-manifest.json` omits `docs/reports/xelor-master-plan-interactive.html`. Other 11 top-level HTML sources are covered.
- Counts need clear scope: `apps/web/src/modules/registry.ts:56` registers 24 base modules and conditionally adds blueprint only with `NEXT_PUBLIC_PUBLIC_DEMO=true` (line58). The validator counts 25 source module folders/imports. The 173 navigation references include the four blueprint references; 58 is the distinct permission count. These measures are not interchangeable.
- Four confirmed regex/context overmatches: `docs/reports/xelor-master-plan-interactive.html:718` says "Phase 1 modules", which is read as a total of 1. `docs/reports/xelor-platform-architecture-and-verification-dossier.html:166` compares a historical 90-migration baseline and a +6 delta to the current total96; line619 says "ONYX adds ...6 migrations", again a delta. These should not be fixed by substituting96 everywhere.
- Test comparisons are against a hand-maintained snapshot, not fresh execution. `apps/web/scripts/validation/check-technical-report-facts.mjs:50` stores994 total/103 API/58 web. This audit actually ran63 web tests. Therefore the two "104 API tests versus103" findings prove disagreement with the recorded snapshot, not the present API suite's true count.

## Source baseline distinction

XELOR-MVP's Source/Flow/Pocket screens are labelled "Designed, not built" and are public-demo-only (`apps/web/src/modules/blueprint/manifest.ts:4`, `parts.tsx:49`). Pocket explicitly states no manifest, service worker or offline queue (`screens/pocket.tsx:47`). Its limited live tiles read Sales, Purchase and Quality (`blueprint/api.ts:67`) with at most100 records per API.

AIKYANTRA is a different, newer implementation. `C:/ORGANISED/AIKYANTRA/CLAUDE.md:9` names `platform/` as the only maintained implementation. The four-product ADR supersedes historical fork packaging (`docs/00-governance/02-four-product-consolidation.md:7`). It has29 registered source modules, including quotations, sourcing, network, connectivity and a decision workspace (`platform/apps/web/src/modules/registry.ts`). Product profiles are declared in `platform/apps/web/src/spine/product/profile.ts:14`.

Implemented integrated surfaces include:

- Customer quotations with revisions and conversion: `platform/apps/web/src/modules/quotation/manifest.ts:175`.
- RFQ list/detail, quotes, gates and awards: `platform/apps/web/src/modules/sourcing/manifest.ts:86`; components and screens under that module.
- Supplier directory, multi-line tenders, message previews and ranked answers: `platform/apps/web/src/modules/network/manifest.ts:38`.
- Connection create/test/sync/import/evidence inspection: `platform/apps/web/src/modules/connectivity/screens/connections.tsx:19`.
- Source-grounded questions, commitment/recovery assessments and measured baseline/actual outcomes: `platform/apps/web/src/modules/decisionworkspace/screens/workspace.tsx`.
- Installable web manifest and reconnect-only offline fallback: `platform/apps/web/src/app/manifest.ts:4` and `platform/apps/web/public/sw.js:1`. The service worker caches only the offline page/icon; it does not cache business data or queue business writes.

Integrated limits are explicit in `platform/docs/07-product/connectivity-contract.md`: remote connectors are read-only, vendor deployments have not been certified, questions use grounded deterministic rules (no LLM), no external write-back/OAuth refresh/scheduled sync/general pagination, no BOM explosion or multi-machine scheduling in connection-based commitment screening. SOURCE defaults to preview; configured delivery adapters exist but delivered/read receipts are unimplemented (`platform/docs/04-integrated-product/sourcing-and-tenders.md:31`).

One frontend production issue merits follow-up before enabling notification senders: network message UI hardcodes "Nothing has been sent. No live WhatsApp or email sender is configured" (`platform/apps/web/src/modules/network/screens/messages.tsx:125`) and preview captions at191/290, despite integrated backend documentation defining configured senders. This copy should be driven by actual provider/delivery state. No real notifications were sent during this audit.

`C:/ORGANISED/AIKYANTRA/deliverables/Verification-2026-09-07.md` records prior integrated checks (1,124 tests, four builds, live API scenarios, responsive/PWA probes). Those are historical evidence, not rerun by this frontend audit. Current full build, browser workflows, live databases, vendor systems and physical mobile devices were not verified here.

# AIKYANTRA implementation verification

Verified locally on 7 September 2026 using the new `aikyantra_demo` database. Original source repositories and databases were preserved. External vendor production instances and physical mobile devices were not available for certification.

## Regression checks

| Check | Result |
|---|---|
| Shared platform tests | 872 passed |
| API tests | 173 passed in the default suite; the remaining database-dependent test passed when run explicitly |
| Web tests | 66 passed |
| Database tests | 6 passed |
| Edge tests | 6 passed |
| Total exercised | **1,124 passed, 0 failed** across the default suite and the explicit database test |
| Full repository lint | Passed |
| Full workspace typecheck | Passed after all four production builds |
| Module boundaries/registration | Passed: 29 modules, 63 navigation permissions |
| Tenant RLS | Passed: 258 tenant-scoped tables |
| Permission coverage | Passed: 179 route permissions, 358 tenant catalogue rows, zero uncatalogued grants |
| Schema naming | Passed: 268 tables |
| Inherited AI evaluation gates | Four feature datasets passed; 5 grounding scenarios passed with zero violations |

The default suite reported 1,123 passes and skipped one pre-existing database-dependent data-import batch-resumption test. That remaining test was then run explicitly with the isolated database configured and passed. New connectivity import retries and mismatched idempotency payloads were also exercised through the running API.

Evidence: `platform/.run/final-tests.log`, `final-lint.log`, `final-module-check.log`, `final-ai-eval.log`, and `dataimport-live-test.log`. The AI evaluation configuration uses the deterministic stub provider; these are regression gates, not a benchmark of a production language model.

## Business workflow checks

The new database was populated through business APIs: base world 54/54, factory story 103/103, commercial 22/22 and supplier network 13/13. The commercial and network scenarios were replayed successfully. A fresh integrated tender added 12/12 checks.

The fresh tender checks covered two requirements, network supplier invitations and responses, deadline enforcement, MOQ and delivery-date refusal, atomic rollback, segregation of duties, and concurrent award attempts. One request succeeded and the competing request was rejected. Exactly two linked purchase orders were created; each included its ₹500 freight charge in the commitment total.

A consistent DESK snapshot returned real supplier/quote/award aggregates. Database inspection confirmed repeatable-read isolation, no duplicate award orders, tenant separation for tenders and restricted mutation of evidence history. The retained Managed Services endpoint returned its explicitly illustrative dataset; this was not presented as live monitoring.

Evidence: `platform/.run/integrated-seed.log` and `integrated-commercial-verify.log`.

## Connected evidence checks

Twenty-five focused unit checks passed for adapter contracts, Odoo HTTP authentication/normalization fixtures, Tally/SAP/CSV parsing, encrypted credentials, destination restrictions, redirects, response limits, freshness and decision rules. These checks are included in the API suite above.

Twenty-three running-API checks passed for native connection creation/test/sync, immutable snapshot replay, changed-payload rejection, evidence citations, unsupported-question handling, stale or missing data, JSON/CSV import, comparable outcomes and tenant isolation. Additional parser checks returned 400 for malformed JSON and 413 for excessive request size.

The demonstration connection **3S Precision — factory ERP** was synchronized from actual demo records: 5 sales orders, 21 inventory items and 5 suppliers. Verification-only connections and outcome observations are explicitly labelled. Synthetic fixture measurements are not realized business savings.

## Device and build verification

Desktop and phone-sized browser checks cover the integrated home, Connections, Decisions, tender screens and mobile navigation. The app includes a manifest, installation prompt support and a reconnect-only offline fallback. It does not cache business data or queue offline transactions.

All four production builds passed and remain running:

| Product | Application | Verification |
|---|---|---|
| ONYX ERP | http://localhost:4001/home | Correct profile, nonempty home, no browser errors; 3 API packaging checks |
| XELOR AI | http://localhost:4101/home | Correct profile, Connections navigation, desktop/390px mobile; 4 API packaging checks |
| SOURCE network | http://localhost:4201/home | Correct profile, Tenders navigation, desktop/390px mobile; 4 API packaging checks |
| AIKYANTRA integrated | http://localhost:4301/home | Desktop overview, 390px decision workspace, no overlay/overflow/errors; ERP, connectivity and tender APIs all returned 200 |

Fourteen API profile/domain checks passed. The integrated local-network URL `http://192.168.0.48:4301/home` also returned 200; a phone on the same Wi-Fi can use it while the computer and servers are running. This private IP may change with the network.

The PWA check verified the manifest, service-worker scope and cache contents, then injected a network rejection inside the worker while the page was offline. The reconnect screen appeared; restoring connectivity reopened the business overview. Chromium context offline emulation alone did not cover the service-worker target, so the final check explicitly simulated failure there. Evidence: `platform/.run/pwa-verification.log`; repeat with `WEB_BASE=http://localhost:4301 node apps/web/scripts/validation/verify-pwa.mjs` from `platform`.

Build/start logs: `platform/.run/build-phase-1.log` through `build-phase-4.log`, and `start-phase-1.log` through `start-phase-4.log`. The four builds also performed TypeScript validation. Final workspace typecheck: `platform/.run/final-typecheck.log`.

Screenshots are in [screenshots](screenshots/): integrated desktop/mobile, connections desktop/mobile, mobile decisions, tender detail and the three standalone homes. These are browser captures of the implemented application.

## Practical limits

- Vendor adapters require customer endpoints, credentials, configuration and acceptance tests. Generic imports extend coverage, but there is no universal connector or unrestricted external write-back.
- Connected questions run grounded rules; the inherited model runtime is configured separately and currently uses a stub.
- Supplier notifications remain in preview. Live email/WhatsApp requires configured providers; verification sent no real messages.
- The phone experience is responsive web/PWA. Native store packages, offline business writes, push refresh and physical-device certification are not part of this delivery.
- This is a locally verified product implementation. It does not establish statutory certification, production resilience, market superiority or measured customer savings.

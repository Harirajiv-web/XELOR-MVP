# Web operational scripts

- `build/build-login-theme.mjs` — bundles the Keycloak login backdrop.
- `validation/check-module-manifests.mjs` — validates module folders, registry entries,
  screens and permissions.
- `render-agent-guides.mjs` — generates the plain-language master Agent System guide
  and all nine individual agent guides as HTML and PDF, with page-overflow checks and
  visual proof screenshots.
- `validation/check-business-revenue-model.mjs` — recomputes the pricing, market-size,
  customer-count, break-even, investment and dilution arithmetic used by the investor
  revenue-model PDF and checks that its key outputs remain in the source report.
- `render-project-reports.mjs` — renders the technical reports, beginner's complete-platform
  guide and concise investor business/revenue model into final PDFs, with targeted visual
  proof screenshots (every page section for the beginner guide).

Run them through the package scripts `build-login-theme` and `module-check` so their physical
locations can evolve without changing developer commands.

Regenerate the agent handbook set with `pnpm --filter @ind-core/web render-agent-guides`.
The final PDFs are written to `docs/05-deliverables/agent-guides/`; editable/generated HTML
stays under `docs/reports/agent-guides/`.

Before sharing the business model, run
`pnpm --filter @ind-core/web check-business-revenue-model`, then render it with
`node apps/web/scripts/render-project-reports.mjs business-revenue`.

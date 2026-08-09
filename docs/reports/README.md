# XELOR report sources

This directory holds the HTML used to produce the final PDFs. It is separated from
`docs/05-deliverables/` so editable source and shareable output are never confused.

- `agent-guides/` contains generated HTML for the master guide and each agent.
- `xelor-*.html` contains the editable project-report sources, including the beginner's
  complete-platform guide and the concise business and revenue model. Their render manifest
  binds every source and PDF to the renderer that produced it; the business model also has
  an adjacent assumptions manifest.

Render the outputs from the repository root:

```bash
pnpm --filter @ind-core/web render-agent-guides
node apps/web/scripts/render-project-reports.mjs
```

Render only the business and revenue model after checking its calculations:

```bash
pnpm --filter @ind-core/web check-business-revenue-model
node apps/web/scripts/render-project-reports.mjs business-revenue
```

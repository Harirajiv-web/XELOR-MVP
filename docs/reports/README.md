# XELOR report sources

This directory holds the HTML used to produce the final PDFs. It is separated from
`docs/05-deliverables/` so editable source and shareable output are never confused.

- `agent-guides/` contains generated HTML for the master guide and each agent.
- `xelor-*.html` contains the four editable project-report sources.

Render the outputs from the repository root:

```bash
pnpm --filter @ind-core/web render-agent-guides
node apps/web/scripts/render-project-reports.mjs
```

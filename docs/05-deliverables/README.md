# XELOR shareable deliverables

This directory contains the final, presentation-ready documents. Source material and
implementation notes live elsewhere under `docs/`; these files are the versions intended
to be shared with investors, product teams, architects and delivery partners.

## Markdown briefs

- [ACHILES complete agent brief](ACHILES_COMPLETE_AGENT_BRIEF.md) — a plain-language but
  complete explanation of ACHILES: its checks, status logic, scheduling, permissions,
  evidence, Agent OS role, RELAY hand-off and current production boundaries.

## Project reports

- [Complete platform guide in simple words](project-reports/XELOR_COMPLETE_PLATFORM_SIMPLE_GUIDE.pdf) — a beginner-friendly explanation of every agent, module, main screen, workflow, control, integration and robotics boundary.
- [MVP technical handoff brief](project-reports/XELOR_MVP_TECHNICAL_HANDOFF_BRIEF.pdf)
- [Technology stack and production roadmap](project-reports/XELOR_TECHNOLOGY_STACK_AND_PRODUCTION_ROADMAP.pdf)
- [Phase 1 and Phase 2 technology and architecture](project-reports/XELOR_PHASE_1_AND_PHASE_2_TECHNOLOGY_AND_ARCHITECTURE.pdf) — a five-page plain-English comparison of the shared stack, ERP foundation, fulfilment control layer, current limitations and next priorities.
- [Agentic AI implementation and strategy](project-reports/XELOR_AGENTIC_AI_IMPLEMENTATION_AND_STRATEGY.pdf)
- [Architecture and implementation playbook](project-reports/XELOR_ARCHITECTURE_AND_IMPLEMENTATION_PLAYBOOK.pdf)
- [Business and revenue model](project-reports/XELOR_BUSINESS_REVENUE_MODEL.pdf) — two
  INR offers for single-plant MSMEs and larger multi-plant manufacturers, customer
  economics, TAM/SAM/TOM/SOM, three-year plan, investment case and all nine per-agent prices.

## Agent guides

- [XELOR agent-system master guide](agent-guides/00_XELOR_AGENT_SYSTEM_MASTER_GUIDE.pdf)
- [ONYX](agent-guides/01_ONYX_AGENT_GUIDE.pdf)
- [HEXA](agent-guides/02_HEXA_AGENT_GUIDE.pdf)
- [MICA](agent-guides/03_MICA_AGENT_GUIDE.pdf)
- [SPAR](agent-guides/04_SPAR_AGENT_GUIDE.pdf)
- [AXLE](agent-guides/05_AXLE_AGENT_GUIDE.pdf)
- [KILN](agent-guides/06_KILN_AGENT_GUIDE.pdf)
- [RASP](agent-guides/07_RASP_AGENT_GUIDE.pdf)
- [RELAY](agent-guides/08_RELAY_AGENT_GUIDE.pdf)
- [ACHILES](agent-guides/09_ACHILES_AGENT_GUIDE.pdf)

## Regeneration

From the repository root:

```bash
pnpm --filter @ind-core/web render-agent-guides
node apps/web/scripts/render-project-reports.mjs
```

Both renderers write directly into this labelled deliverables directory.

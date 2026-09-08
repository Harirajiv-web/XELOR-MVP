# XELOR Agent OS — Claude UI/UX Implementation Brief

> This is the authoritative UI/UX brief for the existing XELOR project. It is not a
> greenfield design prompt. Read the repository and preserve its working architecture before
> proposing or making changes.

## 1. Working agreement

The repository root is:

```text
./MVP_PROTOTYPE_1
```

Before doing anything else:

1. Open and read `MVP_PROTOTYPE_1/CLAUDE.md` completely.
2. Inspect the relevant implementation files listed in this brief.
3. Run `git status --short` and treat all existing changes as user-owned work.
4. Do not reformat, rename, move, delete, or clean unrelated files.
5. Do not make any code change until you have given the user:
   - a concise gap analysis of what already exists;
   - the exact files you propose to change;
   - the visual and functional outcome of each change;
   - the tests you will use; and
   - any risk or ambiguity you found.
6. Wait for the user to type `PROCEED` before editing.

If an instruction in this brief conflicts with `MVP_PROTOTYPE_1/CLAUDE.md`, preserve the
working repository architecture and explain the conflict before proceeding.

After approval, make surgical changes only. Do not silently expand the scope.

## 2. Product context

- Display product name: **XELOR**
- Company/byline: **AIKYANTRA**
- Product category: manufacturing Agentic AI Operating System built on a governed ERP
- Audience for this work: operating users and an investor demonstration
- Current external model APIs: **none**
- Current external agent connectors: **none**
- Current reasoning provider: **deterministic**
- Current orchestration, ERP reads, evidence, checkpoints, approvals and governed action
  dispatch: **live**

The interface must be honest about that boundary. Never imply that OpenAI, Anthropic,
Gemini, Claude, an external webhook, a supplier system or a paid API is connected.

Do not request, add or hard-code an API key. Do not install an AI SDK merely because this is
an agentic product. Do not add fake model streaming or fake external tool activity.

## 3. Actual Agent OS architecture

XELOR uses a custom, provider-neutral, graph-orchestrated supervisor architecture.

It has **seven agents total**, not one brain plus seven subagents:

| Agent | Product role | UI role |
|---|---|---|
| ONYX | Supervisor and mission coordinator | Persistent strategy/synthesis rail |
| HEXA | Governance, policy, approval and verification | Specialist lane |
| MICA | Commercial and customer commitments | Specialist lane |
| SPAR | Inventory, procurement and supply | Specialist lane |
| AXLE | Engineering, planning and scheduling | Specialist lane |
| KILN | Production, quality and maintenance | Specialist lane |
| RASP | Finance, expenditure and people | Specialist lane |

Non-negotiable counting rules:

- Network status: **7/7 agents connected**
- Delegates/specialists: **six**
- Orchestration runway: **six specialist lanes**
- ONYX has its own supervisor region and is never counted as a specialist lane.
- Never create a seventh specialist, eighth agent, placeholder agent or duplicate ONYX.

The runtime is a bounded execution graph with registered agent, capability, transform,
branch, approval and verification nodes. Models may eventually provide structured reasoning
inside registered nodes, but they may not invent capabilities, permissions, graph edges or
side effects at runtime.

All side-effecting work must remain behind the existing human-approval ancestry check.

## 4. The three existing user surfaces

Do not merge these into one page or create replacements for them.

### A. Keycloak sign-in

The sign-in page is served by Keycloak and inherits the secure `keycloak.v2` templates.
XELOR changes its styling and decorative scene without copying `login.ftl`.

Key facts:

- Keycloak runs on a different origin from the web application.
- A successful login performs a real authentication redirect.
- DOM elements cannot literally morph from the Keycloak form into the XELOR application.
- Visual continuity may be created through matching colour, typography, rhythm and a short
  arrival crossfade, but authentication, redirects and session behavior must not change.
- Do not override or copy Keycloak FreeMarker authentication templates.
- Do not change credential handling, request shapes, security controls, error semantics,
  redirects, session storage or token behavior.

The current desktop composition is intentionally a **25/75 split**:

- Sign-in and identity surface on the left.
- Factory intelligence visualization on the right.

Do not reverse it into a generic 55/45 template without first obtaining explicit approval.
The sign-in form must remain immediately usable if the image, WebGL or JavaScript scene fails.

### B. Authenticated ONYX gateway at `/`

The first authenticated frame must immediately show:

- ONYX as the supervisor;
- its six governed specialist connections;
- **7/7 agents connected** when the live catalogue confirms it;
- the real provider mode;
- a clear way to open ONYX Mission Control; and
- the existing department access map.

There must be no mandatory intermediate abstract Brain screen or extra click before the
connected ONYX topology appears.

The gateway is an architectural map and product entrance. It is allowed to show ONYX and its
connections. Do not remove this working topology merely because a generic UI trend discourages
hub-and-spoke diagrams. The operational picture of work belongs in Mission Control.

### C. ONYX Mission Control at `/agentos/command`

This is the operational Agent OS surface inside the existing XELOR application shell.
Preserve the route, module manifest, permissions, navigation and shell.

It should communicate:

```text
Mission
→ ONYX bounds and decomposes the objective
→ six specialists read live ERP evidence in parallel
→ specialists produce attributable recommendations
→ ONYX joins the recommendations
→ HEXA verifies evidence and consequence boundaries
→ a human approves or rejects the controlled plan
→ six governed domain actions dispatch in parallel after approval
→ HEXA verifies the approved execution ancestry
→ ONYX publishes the outcome
```

## 5. Scope of the UI/UX enhancement

The authorized scope is limited to improving the visual and interaction quality of:

1. The existing Keycloak sign-in surface.
2. The existing authenticated ONYX gateway.
3. The existing ONYX Mission Control surface.

Everything else is read-only unless the user explicitly expands the scope.

You are forbidden from:

- Adding registration, onboarding, password recovery, social sign-in, billing or profile
  workflows.
- Adding a new dashboard, page, route, menu item or navigation hierarchy.
- Renaming or changing existing routes.
- Replacing the application shell or moving it into a page.
- Changing APIs, database schemas, permissions, authentication, graph definitions, agent
  identities or business logic for a visual task.
- Adding an external model provider, connector or SDK.
- Replacing the design system or introducing a component, animation or icon library.
- Running repository-wide formatting, dependency upgrades, cleanup or refactoring.
- Editing generated login-theme JavaScript directly.
- Fabricating evidence, data sources, tools, confidence values, agent events or results.
- Exposing raw tenant records, secrets, prompts, tokens or private reasoning in the DOM.
- Displaying private chain-of-thought.
- Creating a timer-driven “demo” that is disconnected from the real run state.

## 6. Design direction — Cognitive Observatory

The desired mood is intelligent, precise, calm, premium, trustworthy and quietly cinematic.
It should feel like an industrial operating system, not a generic SaaS dashboard or a science
fiction HUD.

Use:

- Existing XELOR light/dark theme tokens.
- Existing department accent tokens.
- Soft hierarchy, strong alignment and generous negative space.
- Fine technical linework where it explains structure.
- Selective translucency rather than glass everywhere.
- Crisp typography and readable normal-sized UI copy.
- Tabular numerals for elapsed time, counts and progress.
- Restrained motion that communicates causality.
- Stable completed states with no continued decorative motion.

Avoid:

- Literal hex colours inside screen components.
- Tailwind palette classes that bypass the theme.
- Purple neon blobs and excessive gradients.
- Constant particles or glowing borders.
- Fake terminal text or code rain.
- A static organization chart inside Mission Control.
- A generic grid of agent cards.
- Tiny low-contrast labels.
- Stock robot, brain, circuit-head or “AI hand” imagery.
- Decorative animation competing with authentication or mission controls.

Any visual recommendation must adapt to the existing XELOR token system rather than replacing
it.

## 7. Sign-in requirements

Preserve Keycloak’s real semantic form and upstream security behavior.

The enhanced sign-in must:

- Keep persistent visible labels for username/user ID and password.
- Support password managers, browser autofill, copy and paste.
- Preserve Keycloak’s appropriate autocomplete behavior.
- Keep the show/hide password control as a real button with its existing accessible label.
- Submit when Enter is pressed.
- Preserve generic authentication failure messaging.
- Keep error text close to the form and available to assistive technology.
- Provide a strong visible focus indicator.
- Keep important controls at least 44px high where practical.
- Work at 320px without horizontal scrolling.
- Remain completely usable without WebGL.
- Respect `prefers-reduced-motion`.
- Avoid a white flash when switching between light and dark mode.
- Keep the existing cross-origin theme cookie contract intact.

Do not:

- Hard-code a real username, password, email, endpoint or secret in the UI.
- Add a custom sign-in handler.
- Block paste.
- reveal whether an account exists.
- Add a long intro, fake boot process or video.
- Put the heavy scene bundle in the blocking Keycloak script path.
- Copy `login.ftl` simply to rearrange or rewrite form content.

The right-side visual may be refined only if:

- the form remains the first interaction priority;
- no-GPU and low-power fallbacks remain usable;
- the frame watchdog and scene disposal behavior remain intact;
- reduced motion stops non-essential movement; and
- the result still looks intentional when the scene is absent.

## 8. Gateway requirements

The authenticated gateway must make the complete Agent OS relationship obvious on first paint.

Required content:

- XELOR wordmark and AIKYANTRA byline.
- ONYX as the dominant supervisor.
- All six named specialists.
- Visible connection between ONYX and every specialist.
- Honest runtime/provider status.
- Connected/not-connected state derived from `/agent-os/catalogue`.
- Permission-aware, licensed routes only.
- A clear “Open Mission Control” action.

The topology must be understandable without animation. Motion may reinforce the arrival or
connection state, but the screen must not imply that work is running when there is no active
mission.

Do not reintroduce a mandatory pre-gateway Brain stance. Do not hide a missing catalogue agent;
show it as not connected so the architecture remains stable.

## 9. Mission Control information architecture

Preserve and refine the existing five-region structure:

### A. Mission command bar

Show only real run facts:

- Active mission title.
- Overall run status.
- Elapsed time.
- Active agent count.
- Completed task count.
- Provider mode.

Preserve the existing mission controls. Do not add a separate mission-creation workflow.

### B. ONYX strategy rail

ONYX is a persistent command surface, not a giant circle.

Show:

- ONYX Supervisor identity and purpose.
- Current phase derived from node state.
- Concise user-facing decision summary.
- Mission-decomposition progress.
- Open task packet count.
- Qualitative verification status.
- Guardrail/approval state.
- Existing plan inspection where supported.

Allowed phase vocabulary includes:

- Standing by
- Understanding
- Planning
- Delegating
- Monitoring
- Reviewing
- Awaiting authority
- Synthesising
- Published
- Halted

Do not expose private chain-of-thought. Show only concise plan steps, task rationale,
capability activity, evidence references, handoffs, checkpoints and trace metadata intended
for the operator.

### C. Six-specialist orchestration runway

The runway contains exactly these lanes in this stable order:

1. HEXA
2. MICA
3. SPAR
4. AXLE
5. KILN
6. RASP

Each lane may show, when supported by real run data:

- Agent identity and department.
- Connection state.
- Current task.
- Current visible state and icon.
- Progress derived from nodes.
- Latest meaningful event.
- Registered capability currently executing.
- Evidence/artifact count.
- Time active.
- Expand/collapse control.
- Dependencies and attributable handoffs.

Supported visible states:

- Not connected
- Idle
- Queued
- Waiting for dependency
- Working
- Collaborating
- Handing off
- Under review
- Completed
- Needs attention
- Failed safely

Never communicate a state through colour alone. Pair colour with text, icon and shape.

When a lane expands, show only real task steps, capability calls, evidence summaries, handoffs
and review notes. Routine inspection should remain in place rather than opening unnecessary
modals.

### D. Shared evidence rail

Make the real collaboration record tangible using:

- Capability/evidence tiles.
- Owning agent.
- Record count where safe.
- Execution mode.
- Verification state.
- Checkpoint or event reference.
- Whether the evidence contributed to the final result.

Do not render raw tenant rows merely to make the screen look busy. Mask sensitive content and
never expose secrets, credentials or private trace payloads.

### E. Synthesis and review dock

Communicate convergence using the actual graph:

- Specialist results waiting/received.
- Conflicts or failed checks.
- HEXA verification.
- Human approval status.
- Approved action dispatches.
- ONYX synthesis readiness.
- Published outcome.

The final result may show:

- Executive outcome.
- Material findings.
- Specialist contributions.
- Evidence references.
- Qualitative verification/quality summary.
- Trace inspection already supported by the product.

Do not display invented precision such as `98.73%`. The deterministic reasoner’s numeric
confidence must not be presented as model certainty.

## 10. Real investor demonstration

Do not create a separate scripted sample animation.

Use the existing Northstar controlled-autonomy flow:

1. The authenticated gateway reports the live seven-agent catalogue.
2. The investor opens ONYX Mission Control.
3. The local ERP delivery-risk signal starts the controlled mission.
4. ONYX bounds the objective.
5. Six specialists read tenant-scoped ERP domains in parallel.
6. Specialists return evidence-backed recommendations.
7. ONYX joins them into one controlled plan.
8. HEXA verifies the plan.
9. The graph pauses for attributable human authority.
10. The investor approves or rejects.
11. On approval, exactly six governed internal work items dispatch.
12. HEXA verifies approval ancestry.
13. ONYX publishes the result.

This is a real internal Agent OS demonstration, but not a claim that an external model,
supplier API, email, financial posting or third-party connector executed.

UI copy must clearly distinguish:

- **Live:** orchestration, ERP reads, events, evidence, checkpoints, approval, action ledger
  and audit.
- **Deterministic/offline:** language reasoning.
- **External connections:** zero.

## 11. Motion system

Motion must explain state change, causality and hierarchy.

Suggested timing ranges:

- Immediate control feedback: within 100ms.
- Micro-interactions: 120–220ms.
- Panel/layout transitions: 240–420ms.
- A major arrival transition only when it genuinely adds value: keep it brief and never make
  a returning operator repeatedly wait.

Meaningful vocabulary:

- Task created: packet unfolds.
- Task delegated: packet enters a specialist lane.
- Capability active: restrained progress edge/pulse.
- Handoff: labeled packet crosses between relevant lanes.
- Evidence created: evidence tile settles into the shared rail.
- Dependency waiting: movement pauses and a dependency label appears.
- Review: one restrained scan.
- Completed: movement stops.
- Error: brief emphasis plus explicit text; no violent shake.

Reduced-motion behavior:

- Replace travel with crossfades or immediate state changes.
- Stop ambient motion.
- Preserve every relationship and status in text and structure.

Do not continuously animate large blurred surfaces on low-power devices. Pause or dispose of
ambient effects when the page is hidden.

## 12. Responsive behavior

### Desktop, 1440px and above

- Show ONYX strategy, six lanes, evidence and synthesis with a clear reading order.
- Preserve the XELOR application shell on Mission Control.

### Laptop, 1024–1439px

- Reduce decorative space before reducing information.
- Keep all six lanes available.
- Allow evidence/synthesis areas to stack or collapse without hiding status.

### Tablet

- Use grouped vertical sections.
- Keep the mission bar available.
- Show ONYX first, followed by specialist lanes, evidence and synthesis.
- Replace long connecting paths with labeled dependency/handoff events.

### Mobile

- Sign-in becomes one usable column and removes non-essential scene work.
- Gateway remains a clear connected-agent list/topology without horizontal overflow.
- Mission Control becomes a chronological operational layout.
- ONYX remains the sticky/high-priority summary.
- Specialist rows expand in place.
- Evidence and result may use accessible tabs only if they improve the existing layout.
- Do not scale a desktop graph down to phone size.
- Prevent horizontal scrolling at 320px.

## 13. Accessibility and trust

Target WCAG 2.2 AA quality.

Required:

- Semantic forms, buttons, headings, landmarks and status regions.
- Logical complete keyboard navigation.
- Strong `:focus-visible` treatment.
- At least 4.5:1 contrast for normal text.
- Non-text controls and state boundaries with adequate contrast.
- Pointer targets at least 24×24 CSS pixels, with 44–48px preferred for primary controls.
- Accessible names for icon-only controls.
- Screen-reader announcements for authentication errors, run start, delegation, approval,
  failure and completion.
- No flashing content.
- No meaning conveyed only through colour or motion.
- Zoom and reflow support.
- Essential behavior remains available when animation is disabled.

Trust requirements:

- Never fabricate certainty or source attribution.
- Clearly distinguish queued, working, waiting, approval-bound, rejected and completed states.
- Identify the responsible agent for evidence and actions.
- Do not render raw secrets, credentials, prompts or unfiltered tool payloads.
- Never label deterministic text generation as a connected model.

## 14. Existing implementation boundaries

Inspect these before proposing changes.

### Repository instructions

```text
MVP_PROTOTYPE_1/CLAUDE.md
```

### Sign-in source and theme

```text
MVP_PROTOTYPE_1/infra/keycloak-themes/indcore/login/theme.properties
MVP_PROTOTYPE_1/infra/keycloak-themes/indcore/login/resources/css/indcore.css
MVP_PROTOTYPE_1/apps/web/src/spine/void/login-loader.ts
MVP_PROTOTYPE_1/apps/web/src/spine/void/login-backdrop.ts
MVP_PROTOTYPE_1/apps/web/src/spine/void/floorplan-scene.ts
MVP_PROTOTYPE_1/apps/web/scripts/build/build-login-theme.mjs
```

Generated files—never edit directly:

```text
MVP_PROTOTYPE_1/infra/keycloak-themes/indcore/login/resources/js/backdrop-loader.js
MVP_PROTOTYPE_1/infra/keycloak-themes/indcore/login/resources/js/backdrop.js
```

After changing `login-loader.ts`, `login-backdrop.ts` or related scene source, run:

```text
pnpm --filter @ind-core/web build-login-theme
```

### Authenticated gateway

```text
MVP_PROTOTYPE_1/apps/web/src/app/(void)/page.tsx
MVP_PROTOTYPE_1/apps/web/src/spine/void/gateway.tsx
MVP_PROTOTYPE_1/apps/web/src/spine/void/onyx-void-map.tsx
MVP_PROTOTYPE_1/apps/web/src/spine/void/xelor-type.tsx
```

### Mission Control

```text
MVP_PROTOTYPE_1/apps/web/src/modules/agentos/manifest.ts
MVP_PROTOTYPE_1/apps/web/src/modules/agentos/api.ts
MVP_PROTOTYPE_1/apps/web/src/modules/agentos/screens/command.tsx
MVP_PROTOTYPE_1/apps/web/src/app/globals.css
```

Only edit Agent OS-scoped rules in `globals.css`. Do not redesign the global application
through a Mission Control task.

### Authoritative Agent OS contracts

```text
MVP_PROTOTYPE_1/packages/platform/src/agent-os/types.ts
MVP_PROTOTYPE_1/apps/api/src/agent-os/
MVP_PROTOTYPE_1/docs/01-agent-os/01-foundation.md
MVP_PROTOTYPE_1/docs/01-agent-os/02-mission-control.md
MVP_PROTOTYPE_1/docs/01-agent-os/03-controlled-autonomy.md
```

These contracts are read-only for a UI/UX task unless the user separately approves a runtime
change.

## 15. Validation requirements

After approved implementation, run the smallest relevant set first, then the complete
required checks:

```text
pnpm --filter @ind-core/web typecheck
pnpm --filter @ind-core/web lint
pnpm --filter @ind-core/web module-check
pnpm --filter @ind-core/web build
pnpm --filter @ind-core/web e2e:agent-os
```

Important repository behavior:

- The platform and database packages are consumed through built output; rebuild them before
  trusting stale type errors when relevant.
- Rebuilding Next.js while `next start` is running invalidates the running build. Restart the
  web server after a build before judging the UI.
- A healthy protected API route may answer `401` when probed without a token.
- Do not claim visual correctness from compilation alone.

Verify at minimum:

- Keycloak sign-in in light and dark mode.
- Form usability with WebGL disabled.
- Keyboard-only sign-in and Mission Control operation.
- Reduced-motion behavior.
- 320px, tablet, laptop and 1440px layouts.
- Immediate 7/7 ONYX topology at `/`.
- ONYX opens `/agentos/command`.
- Exactly six specialist lanes.
- Real local signal starts the controlled graph.
- Human approval pauses and resumes it.
- Exactly six governed action dispatches appear after approval.
- Provider mode remains visibly deterministic.
- No external connection is claimed.
- No unrelated route, screen or shell behavior changed.

## 16. Required delivery format

### Before editing

Return:

1. What already exists and should be preserved.
2. The specific UX problems you observed in the running application.
3. A prioritized change proposal.
4. Exact files proposed for modification.
5. Acceptance tests.
6. Risks or questions.

Then stop and wait for `PROCEED`.

### After approved implementation

Return:

1. Outcome-first summary.
2. Exact files changed and why.
3. What changed on sign-in, gateway and Mission Control separately.
4. How every state is sourced from real data.
5. Accessibility and reduced-motion behavior.
6. Tests run and their results.
7. Any limitation still present.
8. Explicit confirmation that:
   - there are seven agents total;
   - there are six specialist lanes;
   - ONYX remains the supervisor;
   - authentication and routes were preserved;
   - reasoning remains deterministic;
   - no external API or connector was added; and
   - no unrelated workflow was modified.

## Final non-negotiable check

The finished experience must look authored rather than generated: precise spacing, deliberate
typography, restrained effects, meaningful motion, clear hierarchy and honest system state.

It must also remain the real XELOR system:

- XELOR by AIKYANTRA.
- ONYX plus six named specialists.
- Immediate connected topology after authentication.
- Live bounded graph orchestration.
- Live ERP evidence and approval-gated internal action dispatch.
- Deterministic reasoning with zero external model connections.
- Existing Keycloak security, routes, permissions, shell and module boundaries intact.

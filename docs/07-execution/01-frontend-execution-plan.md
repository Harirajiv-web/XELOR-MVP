# AIKYANTRA — Investor-Ready Frontend Experience

Use this as the first build prompt for the existing AIKYANTRA product front end.

## Objective

Transform the first moments after login into a cinematic, investor-facing entry experience that presents AIKYANTRA as an intelligent factory operating system. Keep the already-built ERP intact. This work adds a visual gateway and navigation layer in front of it; it must not redesign, remove, or replace any existing ERP functionality.

## Build Brief

Immediately after a successful login, show a full-screen **AI Agent Brain** experience instead of taking the user directly to the ERP.

The scene must feel like an endless, silent void:

- Use a near-black, borderless, full-viewport background with no visible horizon, cards, menus, or UI clutter.
- Place a single brain-like figure at the centre of the screen. It represents the AI agent brain of the factory.
- The brain should hover gently in place, remaining almost still rather than moving dramatically. Give it a very subtle, slow breathing/float motion so the scene feels alive.
- Make the brain hollow on the inside. Its form should be defined by elegant, aurora-like luminous outlines, neural filaments, and faint volumetric glow - not as a solid anatomical object.
- Use premium aurora tones such as electric cyan, teal, violet, indigo, and restrained magenta against the black void. Keep the visual sophisticated, minimal, and credible for investors; avoid a gaming look, excessive particles, or bright UI chrome.
- Add a small, unobtrusive accessibility-friendly cue such as "Enter the factory intelligence" only on focus, hover, or after a short delay. The brain itself remains the primary call to action.
- The entire brain must be clickable and keyboard accessible. Clicking or activating it with Enter/Space begins the next transition.

## Brain-to-Department Transition

When the brain is selected, transition smoothly into the **ONYX department**. The transition should feel like the camera is travelling through the hollow brain - slow initial pull-in, then an elegant zoom through its luminous neural pathways, ending in a wider floating department map.

Do not use a hard page reload. Preserve the sense of continuous space using a polished animated route/state transition.

The ONYX view should also live in the same endless void and remain visually related to the brain scene. Position **ONYX** as the central hub, with active agent-brain connections extending to these departments:

- HEXA
- KILN
- MICA
- SPAR
- AXLE
- RASP

Use the department names, relationship layout, and visual hierarchy already established in the AIKYANTRA Pitch Deck HTML when that source is available. Retain that architecture; restyle it to fit this cinematic void experience rather than inventing a different information structure.

### Department-map behaviour

- ONYX and each connected department should float calmly in 3D-like space with slight depth, parallax, or drift - never frantic motion.
- Connections should look like living intelligent pathways: thin aurora lines, travelling pulses, or softly illuminated neural links.
- Make every department node clearly clickable, with an elegant hover/focus state that reveals its name and a short label if the existing design already defines one.
- Clicking a department must transition the user directly to that department's already-completed ERP segment. Reuse the existing routes, screens, permissions, data loading, and functionality.
- Do not build mock ERP pages. The new experience is an immersive launcher for the real ERP modules.
- Provide an obvious but minimal way to return from the ONYX map to the Brain stance, such as Escape, a discreet back control, or a keyboard-accessible "Return to intelligence" action.

## Inactivity / Screen-Saver Behaviour

Add an inactivity controller across the authenticated product experience.

- After **30 seconds** with no meaningful user activity, automatically return the user to the initial Brain stance.
- Meaningful activity includes pointer movement, clicks/taps, keyboard input, scrolling, touch interactions, and focus interactions.
- Reset the inactivity timer after every meaningful interaction.
- The timeout applies whether the user is on the Brain stance, the ONYX department map, or inside an ERP department.
- Returning to the Brain stance should feel like an intentional, graceful screen saver: fade the current module into the endless void and restore the hovering brain.
- Do not destroy the user's data, submit forms, interrupt a destructive confirmation, or lose unsaved work. If a user is editing unsaved information, use the product's existing safe-unsaved-work behaviour before leaving; otherwise return to the Brain stance automatically.
- To re-enter the ERP after the timeout, the user must follow the same journey again: select the Brain, enter ONYX, then select the required department.

## Product and Interaction Constraints

- Work within the current front-end stack, component system, router, and authentication flow.
- Preserve all existing ERP features, URLs, data integrations, authorization checks, and department-level access control.
- Do not add a traditional dashboard, sidebar, top navigation, onboarding wizard, or visible controls to the initial Brain stance.
- Respect `prefers-reduced-motion`: provide a calm static/low-motion alternative while preserving every navigation path.
- Ensure strong contrast, semantic labels, keyboard navigation, visible focus states, and screen-reader names for the Brain and department nodes.
- Keep performance high: use GPU-friendly transforms, avoid blocking the initial authenticated load, progressively enhance heavier visual effects, and provide a refined fallback for lower-powered devices.
- Make the experience responsive from desktop investor demos through tablet and mobile screens. On smaller screens, maintain the visual story and use a clear tappable arrangement for all department nodes.

## Design Direction

The intended emotional sequence is:

1. **Arrival:** "This is not a conventional ERP - it is the intelligence layer of a factory."
2. **Discovery:** The hollow aurora brain invites exploration without explaining itself too loudly.
3. **System view:** The user enters ONYX and sees a living network of connected factory departments.
4. **Action:** One department selection moves seamlessly into the real, fully-built ERP workflow.
5. **Reset:** After inactivity, the system returns to its striking AI Brain stance, ready for the next demonstration.

## Definition of Done

The implementation is complete when:

- Successful login lands on the hovering hollow aurora Brain in an endless void.
- The Brain can be activated with mouse, touch, and keyboard.
- Brain activation creates a polished continuous zoom into the ONYX map.
- ONYX visibly connects to HEXA, KILN, MICA, SPAR, AXLE, and RASP.
- Selecting any department opens its existing, working ERP segment.
- Thirty seconds of inactivity safely returns the user to the Brain stance from anywhere in the authenticated product.
- The motion is premium but restrained, accessible, responsive, and does not compromise existing ERP functionality.

Before implementing, inspect the AIKYANTRA Pitch Deck HTML and existing front-end routes/components. Use them as the source of truth for the precise ONYX network layout and for the destination routes of HEXA, KILN, MICA, SPAR, AXLE, and RASP.

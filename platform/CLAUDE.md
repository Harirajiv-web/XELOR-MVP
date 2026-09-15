# Shared platform context

Read the parent [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md) and [README.md](../README.md).

Current products: XELOR ERP (phase 1), ONYX AI intelligence (phase 2), AIKYANTRA supplier network (phase 3), and a neutral integrated workspace (phase 4). This directory contains their shared implementation.

This working directory is on native Windows. Use the parent Windows launchers and `LOCAL-HOSTING.md`. Configuration belongs in this directory's private `.env`; keep databases, migration history and launcher ownership intact. Do not use historical macOS/WSL setup instructions.

Product naming changes do not rename compatibility identifiers: database namespaces, phase IDs, permissions, agent identities, protocol source strings, storage keys and `ONYX_*`/`SOURCE_*`/`XELOR_*` configuration retain their existing meaning. New visible product labels follow the owner's current mapping.

Preserve the inherited UI architecture: shared shell in the layout; theme tokens rather than hardcoded screen palettes; module-declared navigation/signals/alerts; deterministic alerts; Keycloak theme build step for theme-source changes. Keep demo fixtures labelled. Run checks appropriate to the change, never data resets as routine verification.

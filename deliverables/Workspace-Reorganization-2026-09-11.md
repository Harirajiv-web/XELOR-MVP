# Workspace reorganization and product naming

Date: 11 September 2026. Main workspace: `C:/ORGANISED/XELOR-MVP`.

| Product | Directory | Responsibility | Web / API |
|---|---|---|---|
| XELOR | `XELOR/` | Manufacturing ERP | 4001 / 4000 |
| ONYX | `ONYX/` | AI intelligence layer | 4101 / 4100 |
| AIKYANTRA | `AIKYANTRA/` | Supplier network | 4201 / 4200 |
| Integrated workspace | `INTEGRATED/` | Combined view | 4301 / 4300 |

## Implementation

The current directory now uses the integrated platform baseline `2e4490b` on branch `organize/product-names`. All application code is in `platform/`. Product folders contain manifests, Bash entry points and Windows build/start/stop wrappers. Runtime profile names, current product documentation, native launcher messages, supplier response branding, shared login assets and intelligence descriptions use the corrected roles.

The original phase-2 source (`13e8ecf`) and integrated source baseline are retained as complete ZIP archives under `archive/history/`. Both ZIPs passed integrity checks. Former root dependency/generated files and configuration are under `archive/legacy-xelor-phase-2-runtime/`. All five existing output PDFs passed SHA-256 comparisons against their pre-organization contents. Original research and dated verification evidence remain available.

Existing phase IDs, ports, database names, migration files, module permissions, protocol/source identifiers, environment keys and agent identities were retained. Private current configuration is at `platform/.env`; historical private configuration remains in the ignored archive. Process ownership records were not copied from other worktrees. No database reset, seeding or migration was performed.

Two upstream `UI:UX.md` paths remain excluded by Windows sparse-checkout because NTFS cannot materialize those filenames. Their contents remain in Git and the integrated-baseline ZIP. Application code is included.

## Verification

| Check | Result |
|---|---|
| Dependency installation | Frozen lockfile; 737 packages reused from the local cache; no lockfile change |
| Shared domain package | Build passed |
| Database package | Build passed; no database mutation |
| API package | Build passed, including final graph/capability text |
| Production web builds | XELOR (1), ONYX (2), AIKYANTRA (3) and Integrated workspace (4) all passed with the final application copy |
| Generated app manifests | All four production BUILD_ID files exist; generated app names match their product profiles |
| Frontend tests | 66 passed |
| Frontend lint and typecheck | Passed |
| Shared OEE/replan tests | 31 passed |
| Factory-intelligence API service/adapter tests | 16 passed |
| Factory-intelligence graph test | Passed |
| Final workspace grouping check | 5 existing tests rerun after the final copy changes; passed |
| Browser-test compatibility | Updated existing login, status and product-wordmark assertions; Playwright collected 47 tests in 15 files; live browser tests were not run |
| Module registry | 29 modules, 63 navigation permissions; passed |
| Runtime product profiles | All four names, numeric IDs and ports matched |
| Launchers | Seven PowerShell scripts parsed, five Bash scripts parsed, Node syntax and alias/invalid-input checks passed |
| Product folders | All four manifests and wrappers resolve the intended phase and shared implementation |
| Git script modes | Executable mode preserved for the four renamed Bash entry points |
| Current document links | Checked entry-document links resolve |
| Renamed-folder references | No references to removed phase-folder paths remain in tracked runtime code or scripts |
| Historical preservation | Both source ZIPs valid; all five PDF hashes unchanged |
| Whitespace checks | Passed for working-tree and staged launcher renames |

All four production web builds completed successfully. XELOR was rebuilt after the final intelligence-copy edits, and its generated JavaScript was checked for those stale phrases. Build logs are stored locally under `.run/workspace-reorganization/builds/phase-N.log`.

Build verification does not establish a running customer deployment or a live integration. Application services were not started by this reorganization. The Keycloak import configuration now uses a neutral shared display name; an already provisioned realm retains its stored display settings until its configuration is updated.

## Use the workspace

From PowerShell at the repository root, run `./XELOR/start.ps1`, `./ONYX/start.ps1`, `./AIKYANTRA/start.ps1` or `./INTEGRATED/start.ps1`. Add `build` to rebuild a selected product and `stop` to stop its recorded processes. Read `LOCAL-HOSTING.md` for this machine's prerequisites and runtime behavior.

Changes remain local and uncommitted. The four Bash entry-point renames are staged to preserve their executable modes; other edits remain available for review. No remote branch was changed.

# Native Windows hosting

The working directory is `C:\ORGANISED\XELOR-MVP`. Product source is maintained together in `platform/`; the named product folders provide launchers and product manifests. The current product mapping is XELOR for ERP, ONYX for AI intelligence, and AIKYANTRA for the supplier network. `INTEGRATED` combines all three. Other worktrees under `C:\ORGANISED` retain their earlier snapshots.

| Product | Application | API |
|---|---|---|
| XELOR phase 2 ERP (technical profile 1) | http://localhost:4001 | http://localhost:4000 |
| ONYX AI intelligence (phase 2) | http://localhost:4101 | http://localhost:4100 |
| AIKYANTRA supplier network (phase 3) | http://localhost:4201 | http://localhost:4200 |
| Integrated workspace (phase 4) | http://localhost:4301 | http://localhost:4300 |
| Plant Operations (phase 5) | http://localhost:4401 | http://localhost:4400 |
| Quality, Safety & Compliance (phase 6) | http://localhost:4501 | http://localhost:4500 |
| Warehouse & Dispatch (phase 7) | http://localhost:4601 | http://localhost:4600 |
| Planning & Engineering (phase 8) | http://localhost:4701 | http://localhost:4700 |
| Revenue & Service (phase 9) | http://localhost:4801 | http://localhost:4800 |
| Delivery & Managed Services (phase 10) | http://localhost:4901 | http://localhost:4900 |

**XELOR phase 2 is an ERP edition name.** All numeric launcher arguments and environment profile IDs remain unchanged: `-Phase 1` selects this ERP, while `-Phase 2` still selects ONYX. The ERP continues to use `platform/apps/web/.next/phase-1` and the existing local database.

To rebuild and locally host only the ERP edition after an update, run these commands sequentially from this directory:

```powershell
.\stop-local.ps1 -Phase 1
.\build-local.ps1 -Phase 1
.\start-local.ps1 -Phase 1
```

This stops only this checkout's recorded ERP processes. The other product profiles and shared PostgreSQL database can remain running. A selected profile must be stopped before its build output is replaced.

From PowerShell in this directory:

```powershell
.\build-local.ps1                  # build shared packages and all four web profiles
.\build-local.ps1 -Phase 1,2       # build shared packages and selected web profiles
.\start-local.ps1                  # start/check all four production builds
.\start-local.ps1 -Phase 1,2       # start/check selected products
.\stop-local.ps1                   # stop application processes created here
.\stop-local.ps1 -Phase 4          # stop one product
```

Each product folder also has a Windows wrapper, callable from this directory:

```powershell
.\XELOR\start.ps1 build
.\XELOR\start.ps1
.\ONYX\start.ps1
.\AIKYANTRA\start.ps1
.\INTEGRATED\start.ps1
.\XELOR\start.ps1 stop
```

Use `build` for each profile before its first production launch. On Bash environments with Node and pnpm available, `./run-phase.sh XELOR dev` (or `ONYX`, `AIKYANTRA`, `INTEGRATED`) selects the same profiles. Numeric phase arguments remain supported. Windows builds and process management should use the PowerShell scripts.

If this shell blocks local script execution, invoke `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1`. This applies only to that invocation.

The launchers use portable Node 22 at `C:\ORGANISED\xelor-local\node22\node.exe` and native PostgreSQL at `C:\ORGANISED\xelor-local\pgenv\Library\bin`, with its existing data directory `C:\ORGANISED\xelor-local\pgdata`. This machine's local runtime is PostgreSQL **16.15 with pgvector**; the repository's deployment target is PostgreSQL **17 with pgvector**. PostgreSQL starts only when needed and remains running when the applications stop. The launchers never create, reset or seed a database.

First setup requires installed platform dependencies, private `platform/.env` configuration, the dedicated `aikyantra_demo` database with migrations applied, built platform/DB/API packages, and each requested web profile built under `platform/apps/web/.next/phase-N`. All four profiles share this database. Preserve the legacy `indcore*` databases. The product README documents setup and explicit demo seeding.

`build-local.ps1` places portable Node 22 first on PATH and calls the installed `pnpm.cmd` through PowerShell, avoiding the upstream `phase.mjs build` Windows spawn issue. It builds shared platform/DB/API packages once, then selected web profiles with matching phase, API origin and output directory. It stops on the first failure and restores the caller's environment afterward. It refuses to overwrite a selected running web profile and never stops processes. Stop selected profiles before rebuilding, then start them again. Unselected profiles can remain running.

For the isolated local demo, configure `API_PUBLIC_DEMO=true`, `NEXT_PUBLIC_PUBLIC_DEMO=true`, and `ONYX_PUBLIC_DEMO=true` before builds/startup. The last flag allows the ONYX intelligence adapter to authenticate to XELOR ERP. `PHASE_2_ERP_ORIGIN` still defaults to the XELOR API on port 4000. Existing configuration keys such as `ONYX_API_BASE_URL`, `ONYX_PUBLIC_DEMO`, `XELOR_WEB_URL` and `SOURCE_PORTAL_BASE_URL` retain their technical names for compatibility. Explicit seeding uses `DEMO_PUBLIC_MODE=true` against the integrated API at port 4300. This local demo uses deterministic stub AI (`AI_PROVIDER=stub`) and preview supplier notifications (`NOTIFY_PROVIDER=preview`).

Runtime files live in `platform/.run`: phase stdout/stderr logs, `windows-phase-N.json` process ownership records, and a shared launcher lock. Startup checks HTTP responses from the API, web page, and web API proxy; in demo mode it also checks `/api/v1/me` for database-backed identity. These checks establish local availability, not completion of every product workflow. A timeout leaves processes and logs available for diagnosis.

Startup accepts occupied ports only when they belong to a recorded, validated process tree. Stop checks executable paths, command lines and process creation times, then stops the recorded parent and its Node descendants, including the actual Next server. It leaves unrelated processes and the shared database running.

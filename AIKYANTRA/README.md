# AIKYANTRA - Supplier network

Supplier discovery and onboarding, RFQs, multi-line tenders, supplier quote links, technical evaluation, governed awards and delivery evidence.

AIKYANTRA owns supplier collaboration and the sourcing network. Its stable launch profile is phase 3: web http://localhost:4201 and API http://localhost:4200.

From PowerShell in this folder:

```powershell
.\start.ps1 build   # compile the shared platform and AIKYANTRA web profile
.\start.ps1         # start the compiled AIKYANTRA profile; preserves data
.\start.ps1 stop    # stop this checkout's recorded AIKYANTRA processes
```

For Bash environments:

```bash
./start.sh          # development server + API; preserves data
./start.sh build    # compile this profile
./start.sh start    # run compiled profile
./start.sh stop     # stop processes created by this launcher
```

Source lives in `../platform`. `XELOR`, `ONYX` and `AIKYANTRA` are the three product folders; `INTEGRATED` launches their combined workspace. Shared source keeps fixes consistent across profiles. Server capability checks and profile navigation define each package. Business permissions and tenant isolation still apply within each package.

See `../README.md` for the product map and `../LOCAL-HOSTING.md` for Windows prerequisites, builds and shared database behavior. The existing `SOURCE_PORTAL_BASE_URL` and `PHASE_3_PORTAL_BASE_URL` configuration keys are preserved.

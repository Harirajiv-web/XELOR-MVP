# ONYX - AI intelligence layer

Connect existing systems, synchronize manufacturing evidence, ask grounded questions, assess order promises, compare recovery options and measure outcomes.

ONYX connects manufacturing evidence to grounded answers and decisions. Its stable launch profile is phase 2: web http://localhost:4101 and API http://localhost:4100.

From PowerShell in this folder:

```powershell
.\start.ps1 build   # compile the shared platform and ONYX web profile
.\start.ps1         # start the compiled ONYX profile; preserves data
.\start.ps1 stop    # stop this checkout's recorded ONYX processes
```

For Bash environments:

```bash
./start.sh          # development server + API; preserves data
./start.sh build    # compile this profile
./start.sh start    # run compiled profile
./start.sh stop     # stop processes created by this launcher
```

Source lives in `../platform`. `XELOR`, `ONYX` and `AIKYANTRA` are the three product folders; `INTEGRATED` launches their combined workspace. Shared source keeps fixes consistent across profiles. Server capability checks and profile navigation define each package. Business permissions and tenant isolation still apply within each package.

See `../README.md` for the product map and `../LOCAL-HOSTING.md` for Windows prerequisites, builds and shared database behavior.

External connection imports work independently. The native factory-agent views read the XELOR ERP API configured by `PHASE_2_ERP_ORIGIN` (default phase 1 on port 4000); start XELOR for that native demo journey. Third-party connections are configured separately in Connections. Legacy ERP-master imports are available in the ERP/integrated profiles, while ONYX uses connection evidence imports. Existing `ONYX_*` adapter environment keys remain compatible; their names are historical configuration identifiers.

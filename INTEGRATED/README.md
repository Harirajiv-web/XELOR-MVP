# Integrated manufacturing workspace

ERP, connected intelligence and supplier commerce share one application, tenant, business records and audit trail.

This profile combines XELOR ERP, ONYX intelligence and the AIKYANTRA supplier network. Its stable launch profile is phase 4: web http://localhost:4301 and API http://localhost:4300. It is a combined view of the three products.

From PowerShell in this folder:

```powershell
.\start.ps1 build   # compile the shared platform and integrated web profile
.\start.ps1         # start the compiled integrated profile; preserves data
.\start.ps1 stop    # stop this checkout's recorded integrated processes
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

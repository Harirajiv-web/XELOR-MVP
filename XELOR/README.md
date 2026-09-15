# XELOR phase 2 - Manufacturing ERP

The ERP-only XELOR edition brings everyday business work into clearer starting points: quotations, purchasing, inventory, items and BOMs, material planning, production, inspections, people and accounts.

XELOR owns the ERP records and factory workflows. **"phase 2" is the XELOR product edition, not a launch-profile number.** Its stable technical profile remains **1**: web http://localhost:4001 and API http://localhost:4000. Numeric profile **2** still launches ONYX AI intelligence on ports 4101/4100.

ONYX and AIKYANTRA retain their separate intelligence and supplier-network roles. This edition focuses on the ERP workspace; the edition name does not imply that proposed add-on packages or general industry customization are complete.

From PowerShell in this folder:

```powershell
.\start.ps1 stop    # stop this checkout's recorded XELOR processes before rebuilding
.\start.ps1 build   # compile shared packages and technical profile 1
.\start.ps1         # start XELOR phase 2 on port 4001; preserves data
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

## Phase 2 workspace

- `/home`: live business signals, role-based focus and company shortcuts.
- `/workflows`: guided links across quote-to-delivery, purchase-to-receipt, production, inspection, accounts and people.
- `/workspace`: searchable directory of permitted core ERP screens.
- `/configure`: saved company navigation, terminology and industry layout presets.
- `/purchase/vendors`: internal supplier performance with receipt and inspection evidence.

Industry presets configure the workspace; they do not implement new accounting rules, regulatory packs or a general custom-field engine. Separate AI, supplier-network, maintenance, advanced quality, connected-factory and managed-service applications are excluded from this ERP edition.

# Phase 2: XELOR — Connected manufacturing intelligence

Connect existing systems, synchronize manufacturing evidence, ask grounded questions, assess order promises, compare recovery options and measure outcomes.

Open http://localhost:4101 after starting the product.

```bash
./start.sh          # development server + API; preserves data
./start.sh build    # compile this profile
./start.sh start    # run compiled profile
./start.sh stop     # stop processes created by this launcher
```

Source lives in `../platform`. The four folders are launchable product packages, so fixes reach all four without maintaining divergent code copies. Server capability checks and profile navigation define each package. Business permissions and tenant isolation still apply within each package.

See `../README.md` for setup and `../deliverables/Four-Phase-Product.md` for the complete product map.

External connection imports work independently. The inherited native factory-agent views read the ERP API configured by `PHASE_2_ERP_ORIGIN` (default phase 1 on port4000); start phase 1 for that native demo journey. Third-party connections are configured separately in Connections. Legacy ERP-master imports are available in the ERP/integrated profiles, while this profile uses connection evidence imports.

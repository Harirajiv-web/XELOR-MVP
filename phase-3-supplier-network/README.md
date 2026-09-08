# Phase 3: SOURCE — Supplier network

Supplier discovery and onboarding, RFQs, multi-line tenders, supplier quote links, technical evaluation, governed awards and delivery evidence.

Open http://localhost:4201 after starting the product.

```bash
./start.sh          # development server + API; preserves data
./start.sh build    # compile this profile
./start.sh start    # run compiled profile
./start.sh stop     # stop processes created by this launcher
```

Source lives in `../platform`. The four folders are launchable product packages, so fixes reach all four without maintaining divergent code copies. Server capability checks and profile navigation define each package. Business permissions and tenant isolation still apply within each package.

See `../README.md` for setup and `../deliverables/Four-Phase-Product.md` for the complete product map.

# Warehouse & Dispatch

One handling unit from gate to truck: scan receiving and put-away, bins, cycle counts, kitting, mobile picking, packing and loading.

| | |
|---|---|
| Technical profile | 7 |
| Web | http://localhost:4601 |
| API | http://localhost:4600 |
| Source | `../platform` (shared; this folder holds the launcher and metadata only) |

## Run it

```powershell
./start.ps1 build     # build this profile's web bundle
./start.ps1           # start it
./start.ps1 stop      # stop only this profile's processes
```

Equivalent from the workspace root: `./build-local.ps1 -Phase 7`, then `./start-local.ps1 -Phase 7`.

## How it connects to XELOR

This package is a separate product with its own runtime, palette and navigation —
it is deliberately not bundled into one application that contains everything.
It reads and writes the same tenant-isolated database as the XELOR ERP, through
the same API and the same permission and RLS rules, so a change recorded here is
visible in XELOR and the reverse. The ERP remains the system of record; this
package never keeps a second copy of stock, ledger or order data.

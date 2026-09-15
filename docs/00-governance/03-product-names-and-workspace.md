# Product names and main workspace

Date: 11 September 2026. Status: implemented from the owner's explicit instruction.

## Decision

XELOR is the manufacturing ERP and system of record. ONYX is the AI intelligence layer. AIKYANTRA is the supplier network. The existing combined profile is called **Integrated workspace**; it is not assigned a fourth product brand.

The main working directory is `C:/ORGANISED/XELOR-MVP`. Its product entry folders are `XELOR/`, `ONYX/`, `AIKYANTRA/` and `INTEGRATED/`, backed by one canonical `platform/`. The source baseline is the integrated implementation at `2e4490b`, checked out on `organize/product-names`. The earlier phase-2 source is retained in source history and a local archive.

| Before | Current product | Folder | Existing phase / ports |
|---|---|---|---|
| ONYX ERP | XELOR ERP | `XELOR` | 1 / 4000 API, 4001 web |
| XELOR intelligence | ONYX AI intelligence | `ONYX` | 2 / 4100 API, 4101 web |
| SOURCE network | AIKYANTRA supplier network | `AIKYANTRA` | 3 / 4200 API, 4201 web |
| AIKYANTRA integrated | Integrated workspace | `INTEGRATED` | 4 / 4300 API, 4301 web |

## XELOR phase 2 edition

The owner's subsequent ERP-only upgrade is named **XELOR phase 2**. This is the XELOR product edition, while XELOR remains the ERP brand and system of record. The technical profile stays **1**, with API 4000, web 4001 and `.next/phase-1` output. The `XELOR/` entry folder remains the same.

Numeric profile **2** still identifies ONYX AI intelligence. ONYX, AIKYANTRA and the integrated workspace retain their existing product roles, IDs and ports. The archived `xelor-phase-2` checkout is historical source and is not the launch location for this edition. Edition naming does not change database lineage, permissions or integration contracts.

## Scope and compatibility

This supersedes product names and entry-folder names in earlier documents. The September 7 consolidation decision and domain boundaries remain applicable. Phase numbers, ports, database names, applied migration lineage, security controls and module membership are unchanged.

Existing `ONYX_*` ERP adapter keys, `SOURCE_*` supplier configuration, `XELOR_*` operational keys, protocol/source identifiers, auth storage keys and named agent identities remain compatible. Product display names are separate from these stable contracts. No mass replacement or database rewrite is part of this naming change.

Current local configuration comes from the integrated platform and resides in `platform/.env`. Old phase-2 configuration and generated runtime files are archived locally, not used by current launchers. Process ownership records were not transferred between checkouts. Application startup does not reset or reseed any database.

Historical PDFs, research material and verification snapshots retain their content and filenames. Their dates and old naming must be considered when reading them. New current documentation follows this mapping.

The two upstream `UI:UX.md` paths are excluded by the same Windows sparse-checkout rule used in the original integrated worktree because colons cannot be materialized as ordinary NTFS filenames. Their source remains in Git and in the baseline ZIP archive. The configured sparse rules do not exclude application code.

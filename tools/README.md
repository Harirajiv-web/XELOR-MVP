# Repository Tools

## XELOR demo upgrade PDF

The shareable demo and technical implementation blueprint is generated from repository
evidence and the checked implementation contract:

- workspace/docs/07-execution/02-xelor-demo-upgrade-implementation-blueprint.md
- workspace/docs/07-execution/03-demo-upgrade-codebase-manifest.json
- tools/create_xelor_demo_upgrade_pdf.py

Requirements:

- Python 3
- reportlab
- pypdf for verification
- PyMuPDF or Poppler for visual QA

Run:

    pnpm demo-upgrade-check
    pnpm pdf:demo-upgrade
    pnpm pdf:demo-upgrade:verify

The generator derives the current branch and commit, records the codebase manifest hash,
and refuses to build when required implementation anchors are missing. The output is:

    output/pdf/XELOR_DEMO_UPGRADE_TECHNICAL_IMPLEMENTATION_BLUEPRINT.pdf

Generated QA images belong under tmp/pdfs and are intentionally ignored.

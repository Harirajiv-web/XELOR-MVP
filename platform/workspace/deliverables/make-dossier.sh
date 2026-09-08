#!/usr/bin/env bash
#
# Rebuild both forms of the Architecture & Verification Dossier from the one source.
#
#   ./make-dossier.sh
#
# There is exactly one source of truth:
#
#   PHASE-2/docs/reports/xelor-platform-architecture-and-verification-dossier.html
#
# It is authored for print (A4 @page rules). This script produces the two things you
# actually hand over, both at the top of this directory:
#
#   XELOR_Architecture_Dossier.pdf    — rendered through Playwright/Chromium
#   XELOR_Architecture_Dossier.html   — the same content restyled for reading on a screen
#
# The HTML is GENERATED from the print source, not maintained beside it, so the two can
# never disagree about a number. Edit the source, run this, and both move together.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

echo "── rendering the PDF"
(cd PHASE-2 && pnpm --filter @ind-core/web render-project-reports dossier) >/dev/null 2>&1 || {
  echo "PDF render failed. Run it directly to see why:" >&2
  echo "  cd PHASE-2 && pnpm --filter @ind-core/web render-project-reports dossier" >&2
  exit 1
}
# The render pipeline writes inside the repo alongside the other reports; the deliverable
# lives up here. Moved, not copied, so exactly one PDF exists on disk.
mv -f "PHASE-2/docs/05-deliverables/project-reports/XELOR_PLATFORM_ARCHITECTURE_AND_VERIFICATION_DOSSIER.pdf" \
      "XELOR_Architecture_Dossier.pdf"

echo "── building the screen HTML"
python3 PHASE-2/apps/web/scripts/build-dossier-html.py

echo
ls -lh XELOR_Architecture_Dossier.pdf XELOR_Architecture_Dossier.html | awk '{printf "   %-38s %s\n", $9, $5}'
echo "   done — open either by double-clicking it."

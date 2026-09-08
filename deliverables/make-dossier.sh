#!/usr/bin/env bash
#
# Rebuild both forms of the historical Architecture & Verification Dossier.
# Current product scope is documented in Four-Phase-Product.md.
#
#   ./make-dossier.sh
#
# There is exactly one source of truth:
#
#   ../platform/docs/reports/xelor-platform-architecture-and-verification-dossier.html
#
# It is authored for print (A4 @page rules). This script produces the two things you
# actually hand over, both at the top of this directory:
#
#   Architecture-Dossier.pdf    — rendered through Playwright/Chromium
#   Architecture-Dossier.html   — the same content restyled for reading on a screen
#
# The HTML is GENERATED from the print source, not maintained beside it, so the two can
# never disagree about a number. Edit the source, run this, and both move together.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(cd "$HERE/../platform" && pwd)"

echo "── rendering the PDF"
(cd "$PLATFORM_DIR" && pnpm --filter @ind-core/web render-project-reports dossier) || {
  echo "PDF render failed. Run it directly to see why:" >&2
  echo "  cd \"$PLATFORM_DIR\" && pnpm --filter @ind-core/web render-project-reports dossier" >&2
  exit 1
}
# Keep the indexed platform report and refresh the workspace's shareable copy.
cp "$PLATFORM_DIR/docs/05-deliverables/project-reports/XELOR_PLATFORM_ARCHITECTURE_AND_VERIFICATION_DOSSIER.pdf" \
   "$HERE/Architecture-Dossier.pdf"

echo "── building the screen HTML"
python3 "$PLATFORM_DIR/apps/web/scripts/build-dossier-html.py" \
  "$PLATFORM_DIR/docs/reports/xelor-platform-architecture-and-verification-dossier.html" \
  "$HERE/Architecture-Dossier.html"

echo
ls -lh "$HERE/Architecture-Dossier.pdf" "$HERE/Architecture-Dossier.html"
echo "   done — open either by double-clicking it."

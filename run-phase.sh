#!/usr/bin/env bash
# XELOR ERP, ONYX intelligence, AIKYANTRA suppliers, or the integrated workspace.
# Usage: ./run-phase.sh <XELOR|ONYX|AIKYANTRA|INTEGRATED|1|2|3|4> [dev|start|build|stop]
# Starting never resets data. Windows users should use each product's start.ps1.
set -euo pipefail
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "stop" ]]; then
  for phase in 1 2 3 4 5 6 7 8 9 10; do node "$WORKSPACE_DIR/platform/scripts/phase.mjs" "$phase" stop; done
else
  exec node "$WORKSPACE_DIR/platform/scripts/phase.mjs" "${1:-4}" "${2:-dev}"
fi

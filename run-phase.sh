#!/usr/bin/env bash
# Four products, one maintained platform. Starting never resets data.
set -euo pipefail
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "stop" ]]; then
  for phase in 1 2 3 4; do node "$WORKSPACE_DIR/platform/scripts/phase.mjs" "$phase" stop; done
else
  exec node "$WORKSPACE_DIR/platform/scripts/phase.mjs" "${1:-4}" "${2:-dev}"
fi

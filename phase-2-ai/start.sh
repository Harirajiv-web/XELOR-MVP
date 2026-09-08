#!/usr/bin/env bash
set -euo pipefail
PRODUCT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$PRODUCT_DIR/../platform/scripts/phase.mjs" 2 "${1:-dev}"

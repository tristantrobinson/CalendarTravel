#!/usr/bin/env bash
# Wrapper for scheduled drive-time syncs (launchd / cron have a minimal PATH).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Ensure the Node used during setup is on PATH (nvm installs are not on the
# launchd/cron PATH). Update this if your Node location changes.
export PATH="/Users/tristan/.nvm/versions/node/v24.16.0/bin:$PATH"

exec node scripts/sync-drive-times.js

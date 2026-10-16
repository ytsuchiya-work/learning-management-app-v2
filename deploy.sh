#!/usr/bin/env bash
# Build the React client and deploy to Databricks Apps.
# Only the runtime files (server.py / app.yaml / requirements.txt / client/dist)
# are staged into .deploy/ and synced, so the workspace copy stays small.
#
# usage: ./deploy.sh <databricks-profile> [app-name] [workspace-path]
set -euo pipefail

PROFILE="${1:?usage: ./deploy.sh <databricks-profile> [app-name] [workspace-path]}"
APP="${2:-learning-management-app-v2}"
ME="$(databricks --profile "$PROFILE" current-user me -o json | python3 -c 'import json,sys;print(json.load(sys.stdin)["userName"])')"
WS_PATH="${3:-/Workspace/Users/${ME}/${APP}}"

cd "$(dirname "$0")"
(cd client && npm install --no-audit --no-fund && npm run build)

rm -rf .deploy && mkdir -p .deploy/client
cp server.py app.yaml requirements.txt .deploy/
cp -R client/dist .deploy/client/dist

databricks --profile "$PROFILE" sync .deploy "$WS_PATH" --full
databricks --profile "$PROFILE" apps deploy "$APP" --source-code-path "$WS_PATH"

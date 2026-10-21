#!/bin/sh
# myGym server update (Arch Linux box `csodabogar2`, run over Tailscale SSH from the Mac; CLAUDE.md):
#   ssh szakos@csodabogar2 '~/myGym/scripts/server-update.sh'
# Pulls `custom`, then rebuilds and restarts the stack with the commit baked into the app's version,
# so Settings shows "v1.4.1+<commit>" (docker-compose.override.yml passes APP_BUILD to the web build).
set -eu
cd "$(dirname "$0")/.."
git pull --ff-only
APP_BUILD=$(git rev-parse --short HEAD)
export APP_BUILD
echo "Building $APP_BUILD"
docker compose up -d --build
docker compose ps

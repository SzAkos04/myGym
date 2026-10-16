#!/bin/sh
# Re-applies the fork's display name. Idempotent: run after every upstream merge.
# Only the human-visible word "openGym" changes. Lowercase `opengym` identifiers (storage keys,
# MCP name, OPENGYM_* env vars, file names), upstream URLs, licence/credit lines, CHANGELOG,
# NOTICE and LICENSE are left alone on purpose: renaming those would orphan user data or
# misattribute the original project.
set -eu
cd "$(dirname "$0")/.."
NAME="${1:-myGym}"
FILES=$(grep -rIl 'openGym' frontend/src frontend/index.html frontend/public/manifest.json \
  web docker-compose.yml README.md docs/[A-EG-Z]*.md docs/dev api/server.js api/openapi.yaml 2>/dev/null || true)
[ -z "$FILES" ] && exit 0
NAME="$NAME" perl -i -pe '
  next if m{github\.com/|gitlab\.com/|opengym\.ch|licensed for|[Ll]icensed for use|Duarte|Gym visual|Makatserchyk|UPSTREAM_REPO|Based on|original openGym|upstream};
  s/\bopenGym\b/$ENV{NAME}/g;
' $FILES

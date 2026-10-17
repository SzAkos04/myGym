#!/bin/sh
# The fast loop for working on the frontend: build here, copy the result into the running web
# container. No image build, no restart, about 10 seconds; the exercise media stays as the image
# has it. Reload the page (or let the service worker pick the new build up) to see it.
#
#   sh scripts/dev-deploy.sh            # build + copy
#   sh scripts/dev-deploy.sh --no-build # copy what is already in frontend/dist
#
# For a real deploy, or to drop what was copied in, `docker compose up -d --build web`.
set -eu
cd "$(dirname "$0")/.."
[ "${1:-}" = "--no-build" ] || (cd frontend && npm run build)
CONTAINER="${WEB_CONTAINER:-opengym-web-1}"
docker cp frontend/dist/. "$CONTAINER":/usr/share/nginx/html/
echo "copied frontend/dist into $CONTAINER"

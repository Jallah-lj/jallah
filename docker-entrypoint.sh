#!/bin/sh
# Prepares the writable state directory before the API starts.
#
# DATA_FILE/UPLOAD_DIR default to /var/data (the persistent volume on Fly.io,
# Railway, or a docker-compose host). On the very first boot the volume is
# empty, so seed it with the content snapshot that was baked into the image
# (data/database.json at build time). Existing data is never overwritten.
set -e

DATA_FILE="${DATA_FILE:-/var/data/database.json}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/data/uploads}"

# Volumes mount as root; hand ownership to the unprivileged runtime user.
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$(dirname "$DATA_FILE")" "$UPLOAD_DIR" 2>/dev/null || true
fi

mkdir -p "$(dirname "$DATA_FILE")" "$UPLOAD_DIR"

SEED="$(cd "$(dirname "$0")" && pwd)/seed/database.json"
if [ ! -f "$DATA_FILE" ] && [ -f "$SEED" ]; then
  echo "Initializing $DATA_FILE from bundled content snapshot"
  cp "$SEED" "$DATA_FILE"
fi

# Drop privileges (alpine) when started as root, then exec the CMD.
if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
  exec su-exec node "$@"
fi
exec "$@"

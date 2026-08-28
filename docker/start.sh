#!/bin/bash
#
# Supervisor for the combined image: runs the API and the build worker in one
# container.
#
# This exists so a single-service host (e.g. one Render web service) keeps
# working. Running them as two services is still preferred -- see Dockerfile.api,
# Dockerfile.worker and render.yaml -- because a build that exhausts memory here
# takes the API down with it, and the two cannot be scaled apart.

set -uo pipefail

API_PID=""
WORKER_PID=""

shutdown() {
    echo "[docker] Received $1 - stopping services"
    # Signal both, then wait so each gets to run its own graceful shutdown.
    [ -n "$API_PID" ] && kill -TERM "$API_PID" 2>/dev/null
    [ -n "$WORKER_PID" ] && kill -TERM "$WORKER_PID" 2>/dev/null
    wait "$API_PID" "$WORKER_PID" 2>/dev/null
    exit 0
}

trap 'shutdown SIGTERM' TERM
trap 'shutdown SIGINT' INT

echo "[docker] Starting API on port ${PORT:-3000}"
( cd /app/backend-services && exec bun index.ts ) &
API_PID=$!

# PORT belongs to the API. Clearing it for the worker stops its optional health
# probe from trying to bind the same port.
echo "[docker] Starting build worker"
( cd /app/build-services && PORT= exec bun index.ts ) &
WORKER_PID=$!

# Wake as soon as either process exits; neither is useful without the other.
wait -n
STATUS=$?

echo "[docker] A service exited with status $STATUS - shutting down the other"
kill -TERM "$API_PID" "$WORKER_PID" 2>/dev/null
wait 2>/dev/null

exit "$STATUS"

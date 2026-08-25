FROM oven/bun:1-debian

# Install Node.js 20.x, npm, git, and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for optimal Docker layer caching
COPY backend-services/package.json backend-services/bun.lock* ./backend-services/
COPY build-services/package.json build-services/bun.lock* ./build-services/

# Install backend dependencies
WORKDIR /app/backend-services
RUN bun install

# Install worker dependencies
WORKDIR /app/build-services
RUN bun install

# Copy source code
WORKDIR /app
COPY backend-services ./backend-services
COPY build-services ./build-services

# Create supervisor startup script to run both backend and build worker concurrently
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -m' \
    '' \
    'cleanup() {' \
    '    echo "[docker] Stopping services..."' \
    '    kill -TERM "$BACKEND_PID" "$WORKER_PID" 2>/dev/null || true' \
    '    wait "$BACKEND_PID" "$WORKER_PID" 2>/dev/null || true' \
    '    exit 0' \
    '}' \
    '' \
    'trap cleanup SIGINT SIGTERM' \
    '' \
    'echo "[docker] Starting backend-services on port ${PORT:-3000}..."' \
    'cd /app/backend-services && bun index.ts &' \
    'BACKEND_PID=$!' \
    '' \
    'echo "[docker] Starting build-services worker..."' \
    'cd /app/build-services && bun index.ts &' \
    'WORKER_PID=$!' \
    '' \
    'wait -n' \
    'EXIT_STATUS=$?' \
    'echo "[docker] A service exited with status $EXIT_STATUS. Shutting down..."' \
    'cleanup' \
    'exit $EXIT_STATUS' \
    > /app/start.sh && chmod +x /app/start.sh

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["/app/start.sh"]
# syntax=docker/dockerfile:1
#
# Combined image: API + build worker in one container.
#
#   docker build -t rwaft .
#
# This is the default `./Dockerfile` so a single-service host (one Render web
# service) works without extra configuration.
#
# Running the two as separate services is still preferred -- see Dockerfile.api,
# Dockerfile.worker and render.yaml. They have very different resource profiles
# (the API is idle and latency-sensitive; the worker pegs a CPU for minutes and
# needs disk), and in this combined image a build that exhausts memory takes the
# API down with it.

FROM oven/bun:1-debian

# node/npm: the worker shells out to npm to install and build *user* projects.
# git:      simple-git clones submitted repositories.
# tini:     reaps zombies and forwards SIGTERM so graceful shutdown runs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    tini \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Dependency manifests first, so a source-only change reuses these layers.
COPY backend-services/package.json backend-services/bun.lock* ./backend-services/
COPY build-services/package.json build-services/bun.lock* ./build-services/

# --frozen-lockfile keeps the image reproducible: a build can never silently
# resolve a different dependency tree than the one that was tested.
RUN cd /app/backend-services && bun install --frozen-lockfile
RUN cd /app/build-services  && bun install --frozen-lockfile

COPY backend-services ./backend-services
COPY build-services ./build-services
COPY docker/start.sh /app/start.sh

# User projects are built here rather than inside /app: node_modules trees run to
# hundreds of megabytes and the application directory on a PaaS instance is small.
ENV BUILD_ROOT=/tmp/rwaft-builds

RUN chmod +x /app/start.sh \
    && mkdir -p /tmp/rwaft-builds \
    && chown -R bun:bun /app /tmp/rwaft-builds

# Drop privileges -- the oven/bun images ship a non-root `bun` user.
USER bun

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD bun --eval "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]

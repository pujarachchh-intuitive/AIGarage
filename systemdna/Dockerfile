# SystemDNA web app + scanner + IBM Bob Shell, as one container.
# Build context: systemdna/   (docker build -t systemdna-web -f systemdna/Dockerfile systemdna)
#
# The Next.js server spawns the scanner tools (core/scanner/*.mjs), git and the
# bob CLI as child processes, so all three live in the runtime image.

ARG NODE_IMAGE=node:22-bookworm-slim

# --- Scanner: only needs the TypeScript compiler ------------------------------
FROM ${NODE_IMAGE} AS scanner
WORKDIR /app/core/scanner
COPY core/scanner/package.json core/scanner/package-lock.json ./
RUN npm ci --omit=dev
COPY core/scanner/*.mjs ./

# --- Web app build -------------------------------------------------------------
FROM ${NODE_IMAGE} AS web
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Built-in APIs only: an empty NEXT_PUBLIC_API_URL keeps the app off the Python engine.
ENV NEXT_PUBLIC_API_URL=
RUN npm run build

# --- Runtime -------------------------------------------------------------------
FROM ${NODE_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# IBM Bob Shell, pinned and checksum-verified (same package the official
# bob.ibm.com installer downloads, installed without its interactive prompts).
ARG BOB_VERSION=2.0.5
RUN set -eux; \
    base="https://s3.us-south.cloud-object-storage.appdomain.cloud/bob-shell"; \
    curl -fsSL -o /tmp/bobshell.tgz "$base/bobshell-${BOB_VERSION}.tgz"; \
    expected="$(curl -fsSL "$base/bobshell-${BOB_VERSION}.tgz.sha256" | awk '{print $1}')"; \
    echo "${expected}  /tmp/bobshell.tgz" | sha256sum -c -; \
    npm install -g --registry=https://registry.npmjs.org/ --allow-scripts=@officecli/officecli --progress=false --loglevel=error /tmp/bobshell.tgz; \
    rm /tmp/bobshell.tgz; \
    bob --version

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    SYSTEMDNA_SCANNER=/app/core/scanner/ts-scan.mjs \
    SYSTEMDNA_DATA_DIR=/data

COPY --from=scanner --chown=node:node /app/core/scanner /app/core/scanner
COPY --from=web --chown=node:node /app/web /app/web
RUN mkdir -p /data && chown node:node /data

USER node
WORKDIR /app/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/github/status >/dev/null || exit 1
CMD ["node", "node_modules/next/dist/bin/next", "start"]

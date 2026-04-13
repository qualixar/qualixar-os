# =============================================================================
# Qualixar OS Dockerfile — Multi-stage production build
# =============================================================================

# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

WORKDIR /build

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package manifests first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY bin/ ./bin/
RUN npx tsc

# Build dashboard (optional — skip if dashboard/ doesn't exist)
COPY dashboard/ ./dashboard/
COPY src/dashboard/ ./src/dashboard/
RUN cd dashboard && npm ci --ignore-scripts && npm run build 2>/dev/null || mkdir -p /build/dist/dashboard

# ---------- Stage 2: Production ----------
FROM node:22-alpine AS production

# OCI image metadata
LABEL org.opencontainers.image.title="Qualixar OS"
LABEL org.opencontainers.image.description="Qualixar OS: The Universal Agent Operating System"
LABEL org.opencontainers.image.version="2.1.1"
LABEL org.opencontainers.image.vendor="Qualixar"
LABEL org.opencontainers.image.url="https://qualixar.com"
LABEL org.opencontainers.image.source="https://github.com/qualixar/qualixar-os"
LABEL org.opencontainers.image.licenses="FSL-1.1-ALv2"

# Install runtime deps for better-sqlite3 and curl for healthcheck
RUN apk add --no-cache curl

# Remove unnecessary setuid/setgid binaries to reduce attack surface
RUN find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

WORKDIR /app

# Copy compiled output
COPY --from=builder /build/dist/ ./dist/
COPY --from=builder /build/bin/ ./bin/

# Copy dashboard build output (vite outputs to /build/dist/dashboard/)
COPY --from=builder /build/dist/dashboard/ ./dist/dashboard/

# Install production dependencies WITH native module rebuilds (better-sqlite3)
# L-04: Combined into single RUN layer to reduce image size
COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apk del python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S qos && \
    adduser -S qos -u 1001 -G qos && \
    mkdir -p /home/qos/.qualixar-os && \
    mkdir -p /tmp/qos && \
    chown -R qos:qos /app /home/qos/.qualixar-os /tmp/qos

# Harden: make /app read-only except for runtime data dirs
RUN chmod -R a-w /app/dist /app/bin 2>/dev/null || true

ENV NODE_ENV=production
ENV QOS_HTTP_PORT=3000

# Expose HTTP API and Dashboard ports
EXPOSE 3000 3333

# Drop all Linux capabilities — node does not need any
# (enforced via docker-compose cap_drop; documented here for standalone usage)
# docker run --cap-drop=ALL qualixar-os

# Switch to non-root user
USER qos

# Health check against the API
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["node", "dist/channels/cli.js", "serve"]

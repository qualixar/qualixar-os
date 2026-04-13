FROM node:22-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /build/dist/ ./dist/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bin/ ./bin/
# Dashboard is optional -- create empty dir if dist doesn't exist
RUN mkdir -p ./dashboard/dist
ENV NODE_ENV=production
ENV QOS_HTTP_PORT=8421
EXPOSE 8421
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:${QOS_HTTP_PORT}/api/health || exit 1
CMD ["node", "dist/channels/cli.js", "serve"]

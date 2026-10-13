# syntax=docker/dockerfile:1

# --- Build stage: install everything and produce the standalone server ---
FROM node:22-alpine AS builder
WORKDIR /app
# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# --- Migration tool: only the Prisma CLI, pinned to the version in package-lock.json ---
FROM node:22-alpine AS migrator
WORKDIR /prisma-cli
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules/prisma/package.json /tmp/prisma-package.json
RUN npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@$(node -p "require('/tmp/prisma-package.json').version")" \
 && npm cache clean --force

# --- Runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server: server.js plus only the node_modules files the app actually uses.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Schema and migrations, applied on every start.
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=migrator --chown=node:node /prisma-cli/node_modules /opt/prisma-cli/node_modules

# Uploaded evidence and Trust Vault files when GCS_BUCKET is not set. Mount a volume here.
RUN mkdir -p uploads && chown node:node uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

# Apply pending migrations, then start. Safe on every boot: already-applied migrations are skipped.
CMD ["sh", "-c", "node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && exec node server.js"]

# syntax=docker/dockerfile:1

# --- Build stage: install everything, build, then drop dev dependencies ---
FROM node:22-alpine AS builder
WORKDIR /app
# Prisma's query engine needs OpenSSL on Alpine.
RUN apk add --no-cache openssl
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# --- Runtime stage ---
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Production node_modules (includes the Prisma CLI for `migrate deploy` and the generated client).
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.js ./next.config.js
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/.next ./.next

# Uploaded evidence and Trust Vault files when GCS_BUCKET is not set. Mount a volume here.
RUN mkdir -p uploads && chown node:node uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

# Apply pending migrations, then start. Safe on every boot: already-applied migrations are skipped.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node node_modules/next/dist/bin/next start -p ${PORT}"]

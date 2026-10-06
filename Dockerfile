# --- Deps stage ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install only runtime deps + prisma cli for `migrate deploy`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# App bundle from the build stage.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Persist uploaded evidence between deploys (mount a volume here).
RUN mkdir -p uploads && chown -R node:node uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 3000

# Migrate on start so a fresh DB comes up clean.
CMD ["sh", "-c", "npx prisma migrate deploy && node node_modules/next/dist/bin/next start -p ${PORT:-3000}"]

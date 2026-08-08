FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema prisma/schema.postgres.prisma
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs guardian
COPY --from=builder --chown=guardian:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=guardian:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=guardian:nodejs /app/.next ./.next
COPY --from=builder --chown=guardian:nodejs /app/public ./public
COPY --from=builder --chown=guardian:nodejs /app/node_modules/@fontsource/noto-sans-kr ./node_modules/@fontsource/noto-sans-kr
COPY --from=builder --chown=guardian:nodejs /app/prisma ./prisma
COPY --from=builder --chown=guardian:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER guardian
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

# RegLocation Monitor + Backend — production-образ
# Сборка: docker build -t reglocation-monitor .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
# Заранее скачиваем языковые данные OCR в образ, чтобы распознавание не зависело от сети при работе
ENV OCR_CACHE_PATH=/app/.tessdata
RUN node scripts/ocr-warmup.mjs

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fonts-dejavu-core tini && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --home /app reglocation
ENV NODE_ENV=production \
    PORT=8080 \
    OCR_CACHE_PATH=/app/.tessdata
COPY --from=build --chown=reglocation /app/package.json ./
COPY --from=build --chown=reglocation /app/node_modules ./node_modules
COPY --from=build --chown=reglocation /app/prisma ./prisma
COPY --from=build --chown=reglocation /app/dist ./dist
COPY --from=build --chown=reglocation /app/.tessdata ./.tessdata
USER reglocation
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# prisma migrate deploy применяет только новые миграции и никогда не удаляет данные
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node --enable-source-maps dist/server/index.js"]

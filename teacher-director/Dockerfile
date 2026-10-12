# RegLocation Teacher + Director — production-образ
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/* && useradd --system --uid 1001 --home /app reglocation
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=reglocation /app/package.json ./
COPY --from=build --chown=reglocation /app/node_modules ./node_modules
COPY --from=build --chown=reglocation /app/server ./server
COPY --from=build --chown=reglocation /app/dist ./dist
USER reglocation
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/server.mjs"]

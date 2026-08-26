# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# All-in-one production image: Express API + built React UI + JSON data store.
# No database server required. Point DATA_FILE and UPLOAD_DIR at a persistent
# volume (fly.toml mounts one at /var/data) and all CMS content + uploaded
# media survive restarts and deploys.
# ---------------------------------------------------------------------------

# --- Stage 1: build ---------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# npm run build  -> type-checks, builds the client into dist/
# build:server   -> bundles the API into a single dist-server/index.cjs
RUN npm run build && npm run build:server

# --- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime
# Production dependencies only (express, bcryptjs, helmet, multer, ...).
ENV NODE_ENV=production \
    SERVE_CLIENT=true \
    PORT=4000 \
    DATA_FILE=/var/data/database.json \
    UPLOAD_DIR=/var/data/uploads \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# dist/     built client (served by the API when SERVE_CLIENT=true)
# dist-server/  bundled API server (node dist-server/index.cjs)
# seed/     content snapshot used to initialize an empty volume on first boot
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/data/database.json ./seed/database.json
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /var/data && chown -R node:node /var/data

EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist-server/index.cjs"]

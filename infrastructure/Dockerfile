# ImbatranimOS — one dual-mode image. Build context is the REPO ROOT
# (the fork splits deps across apps/ and apps/{frontend,backend}, so the
# whole apps/ tree must be in context).
#
#   prod (default):  slim, Nest serves the built desktop + API on one port
#   dev:             Nest (watch) + Vite (HMR), two ports, for development
#
# Native modules (better-sqlite3, node-pty) are compiled in stages that
# carry build tools; the final prod image copies the built node_modules and
# ships without a compiler.

# ---------------------------------------------------------------------------
# deps — full dependency install (dev + prod), with native build toolchain
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
# Hoisted parent deps shared by the frontend.
COPY apps/package.json apps/package-lock.json ./apps/
RUN cd apps && npm ci
COPY apps/backend/package.json apps/backend/package-lock.json ./apps/backend/
RUN cd apps/backend && npm ci
COPY apps/frontend/package.json apps/frontend/package-lock.json ./apps/frontend/
RUN cd apps/frontend && npm ci

# ---------------------------------------------------------------------------
# builder — compile backend (nest) and frontend (vite, same-origin API)
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY apps ./apps
RUN cd apps/backend && npm run build
# Prod frontend talks to the API same-origin at /api.
RUN cd apps/frontend && VITE_API_URL=/api npm run build

# ---------------------------------------------------------------------------
# proddeps — production-only node_modules (native modules compiled here)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS proddeps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY apps/backend/package.json apps/backend/package-lock.json ./apps/backend/
RUN cd apps/backend && npm ci --omit=dev
# Strip native build intermediates now that the .node binaries are compiled:
# object files, gyp obj.target dirs, and the C sources for node-pty +
# better-sqlite3 (~60MB). The runtime only needs build/Release/*.node.
RUN cd apps/backend/node_modules \
 && find . -name '*.o' -delete \
 && find . -type d -name obj.target -prune -exec rm -rf {} + \
 && rm -rf better-sqlite3/deps better-sqlite3/src node-pty/src node-pty/deps \
 && true

# ---------------------------------------------------------------------------
# prod — slim runtime: no compiler, runs as the unprivileged imbatranim user
# ---------------------------------------------------------------------------
FROM node:22-alpine AS prod
RUN deluser node 2>/dev/null || true; delgroup node 2>/dev/null || true; \
    addgroup -g 1000 imbatranim && adduser -D -u 1000 -G imbatranim imbatranim
WORKDIR /app
# Only the backend's runtime deps ship — the frontend is prebuilt to static
# files, so its hoisted deps in apps/node_modules are not needed at runtime.
COPY --from=proddeps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./public
COPY apps/backend/package.json ./apps/backend/
COPY infrastructure/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /home/imbatranim \
 && chown -R imbatranim:imbatranim /home/imbatranim /app
USER imbatranim
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_ROOT=/app/public \
    FRONTEND_URL=http://localhost:8080 \
    DB_PATH=/home/imbatranim/.imbatranim/db.sqlite \
    NOTES_DIR=/home/imbatranim/notes \
    CONFIGS_DIR=/home/imbatranim/.imbatranim/configs
VOLUME /home/imbatranim
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/backend/dist/main"]

# ---------------------------------------------------------------------------
# dev — source-mounted development: Nest watch + Vite HMR, two ports
# (docker compose dev profile bind-mounts apps/ over this; node_modules stay
# from the image via anonymous volumes)
# ---------------------------------------------------------------------------
FROM deps AS dev
RUN deluser node 2>/dev/null || true; delgroup node 2>/dev/null || true; \
    addgroup -g 1000 imbatranim && adduser -D -u 1000 -G imbatranim imbatranim
WORKDIR /app
COPY apps ./apps
RUN mkdir -p /home/imbatranim && chown -R imbatranim:imbatranim /home/imbatranim /app
USER imbatranim
ENV PORT=3001 \
    FRONTEND_URL=http://localhost:5173 \
    DB_PATH=/home/imbatranim/.imbatranim/db.sqlite \
    NOTES_DIR=/home/imbatranim/notes \
    CONFIGS_DIR=/home/imbatranim/.imbatranim/configs
EXPOSE 3001 5173
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "cd apps/backend && npm run start:dev & cd apps/frontend && npm run dev -- --host 0.0.0.0 & wait"]

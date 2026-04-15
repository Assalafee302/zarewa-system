# Railway / Docker: avoid Railpack cache locking `node_modules/.vite` (EBUSY / "device busy").
# Context excludes `node_modules` via `.dockerignore` — clean `npm ci` inside the image.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# Vite and UI toolchain are in `dependencies`; omit dev-only packages (tests, eslint, …).
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    VITE_CACHE_DIR=/tmp/vite-cache \
    ZAREWA_LISTEN_HOST=0.0.0.0

RUN npm run build

EXPOSE 8787
# Run node directly (no npm wrapper); Railway sets PORT at runtime.
CMD ["node", "server/index.js"]

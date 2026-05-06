FROM node:22-alpine AS base
WORKDIR /app

# ── deps: install node_modules from package.json ──────────────────────────
FROM base AS deps
COPY package.json ./
# npm ci requires a lockfile; npm install generates one from package.json.
# A lockfile is not committed to this repo, so we generate it here.
RUN npm install

# ── builder: compile the Next.js app ──────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# API_URL is read by next.config.ts at build time — Next.js bakes rewrite
# destinations into the standalone bundle's middleware manifest.
# Default targets the Docker Compose backend service name.
ARG API_URL=http://backend:8000
ENV API_URL=${API_URL}

# Ensure a public/ dir exists; Next.js warns if it is missing.
RUN mkdir -p public && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/

RUN npm run build

# ── runner: minimal production image ──────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Bind to all interfaces inside the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# next build --output standalone produces a self-contained server.js.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public

EXPOSE 3000
CMD ["node", "server.js"]

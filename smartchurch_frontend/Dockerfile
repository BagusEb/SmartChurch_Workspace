# ── Stage 1: build ───────────────────────────────────────────────────
# node:22-alpine — lightweight Node image just for building the React app.
# This stage is discarded after build; node_modules never reach the final image.
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first so npm ci layer is cached separately from source code.
# Rebuilds only re-run npm ci when package.json / package-lock.json actually change.
COPY package*.json ./
RUN npm ci

# Copy source and build — outputs to /app/dist
COPY . .
RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────
# nginx:alpine — tiny static file server (~25MB).
# No Node, no source code, no node_modules in the final image.
FROM nginx:alpine

# Serve the compiled React SPA from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace default nginx config with ours which:
# - listens on port 3000 (matching the Vite dev server port)
# - proxies /api/ requests to the backend container
# - adds SPA fallback so React Router handles all routes
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

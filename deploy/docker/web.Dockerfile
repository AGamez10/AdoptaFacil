# syntax=docker/dockerfile:1.7
# Borde HTTPS: Caddy sirve el SPA compilado y hace de proxy inverso hacia la API.
# Contexto: raíz del repo.
#   docker build -f deploy/docker/web.Dockerfile \
#     --build-arg VITE_API_URL=https://adoptafacil.example/api -t adoptafacil-edge .
# Las VITE_* se hornean en el bundle en tiempo de build (Vite no las lee en runtime):
# cambiar una exige reconstruir la imagen. Nunca pongas un secreto en una VITE_*.

ARG NODE_IMAGE=node:20-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ARG VITE_PORTAL_BASE_DOMAIN=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_MERCADOPAGO_PUBLIC_KEY=
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL es obligatoria" >&2; exit 1)
RUN VITE_API_URL="$VITE_API_URL" \
    VITE_PORTAL_BASE_DOMAIN="$VITE_PORTAL_BASE_DOMAIN" \
    VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
    VITE_MERCADOPAGO_PUBLIC_KEY="$VITE_MERCADOPAGO_PUBLIC_KEY" \
    pnpm turbo run build --filter=@adoptafacil/web...

FROM ${CADDY_IMAGE} AS edge
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/web

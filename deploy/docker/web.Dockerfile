# syntax=docker/dockerfile:1.7
# Borde HTTPS: Caddy sirve el SPA compilado y hace de proxy inverso hacia la API.
# Contexto: raíz del repo.
#   docker build -f deploy/docker/web.Dockerfile \
#     --build-arg VITE_API_URL=/api -t adoptafacil-edge .
# Las VITE_* se hornean en el bundle en tiempo de build (Vite no las lee en runtime):
# cambiar una exige reconstruir la imagen. Nunca pongas un secreto en una VITE_*.
#
# PORTALS_TLS elige el binario de Caddy: `cloudflare` o `namecheap` lo compilan
# con el módulo caddy-dns del proveedor (certificado comodín por DNS-01); `off` e
# `internal` usan la imagen oficial sin módulos extra. BuildKit solo construye la
# etapa elegida.

ARG NODE_IMAGE=node:24-bookworm-slim
ARG CADDY_IMAGE=caddy:2.10-alpine
ARG CADDY_BUILDER_IMAGE=caddy:2.10-builder-alpine
ARG CADDY_DNS_CLOUDFLARE=github.com/caddy-dns/cloudflare@v0.2.4
ARG CADDY_DNS_NAMECHEAP=github.com/caddy-dns/namecheap@v1.0.0
ARG PORTALS_TLS=off

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ARG VITE_PORTAL_BASE_DOMAIN=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_PAYMENT_PROVIDER=
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL es obligatoria" >&2; exit 1)
RUN VITE_API_URL="$VITE_API_URL" \
    VITE_PORTAL_BASE_DOMAIN="$VITE_PORTAL_BASE_DOMAIN" \
    VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
    VITE_PAYMENT_PROVIDER="$VITE_PAYMENT_PROVIDER" \
    pnpm turbo run build --filter=@adoptafacil/web...

FROM ${CADDY_IMAGE} AS caddy-off
FROM ${CADDY_IMAGE} AS caddy-internal

FROM ${CADDY_BUILDER_IMAGE} AS caddy-cloudflare-build
ARG CADDY_DNS_CLOUDFLARE
RUN xcaddy build --with "$CADDY_DNS_CLOUDFLARE" --output /usr/bin/caddy

FROM ${CADDY_IMAGE} AS caddy-cloudflare
COPY --from=caddy-cloudflare-build /usr/bin/caddy /usr/bin/caddy
RUN caddy list-modules | grep -qx 'dns.providers.cloudflare'

FROM ${CADDY_BUILDER_IMAGE} AS caddy-namecheap-build
ARG CADDY_DNS_NAMECHEAP
RUN xcaddy build --with "$CADDY_DNS_NAMECHEAP" --output /usr/bin/caddy

FROM ${CADDY_IMAGE} AS caddy-namecheap
COPY --from=caddy-namecheap-build /usr/bin/caddy /usr/bin/caddy
RUN caddy list-modules | grep -qx 'dns.providers.namecheap'

FROM caddy-${PORTALS_TLS} AS edge
COPY deploy/Caddyfile deploy/portals-*.caddy /etc/caddy/
COPY --from=build /repo/apps/web/dist /srv/web

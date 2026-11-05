# syntax=docker/dockerfile:1.7
# Imagen de la API (NestJS) y del paso de migraciones. Contexto: raíz del repo.
#   docker build -f deploy/docker/api.Dockerfile --target runtime -t adoptafacil-api .
#   docker build -f deploy/docker/api.Dockerfile --target migrate -t adoptafacil-migrate .
# `runtime` lleva solo dependencias de producción y corre como usuario sin
# privilegios. `migrate` conserva el CLI de Prisma y psql para
# `prisma migrate deploy`, la rotación del rol de runtime y el chequeo de
# postura RLS (deploy/scripts/migrate.sh). Los colectores BullMQ corren dentro
# del mismo proceso de la API: no hay contenedor de workers aparte.

ARG NODE_IMAGE=node:24-bookworm-slim
# openssl: lo exige el motor de consultas de Prisma (debian-openssl-3.0.x).
# Solo para verificar sin acceso a los repositorios de Debian se puede construir
# con --build-arg NODE_IMAGE=node:24-bookworm --build-arg APT_PACKAGES=
# (la imagen completa ya trae libssl3 y certificados).
ARG APT_PACKAGES="openssl ca-certificates"

FROM ${NODE_IMAGE} AS base
ARG APT_PACKAGES
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0 \
    CI=true
RUN if [ -n "$APT_PACKAGES" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends $APT_PACKAGES \
      && rm -rf /var/lib/apt/lists/*; \
    fi \
 && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@adoptafacil/api...
# Paquete aislado solo con dependencias de producción (incluye contracts compilado).
RUN pnpm --filter @adoptafacil/api deploy --prod /out/api \
 && rm -rf /out/api/src /out/api/test /out/api/scripts \
 # El cliente de Prisma se genera en el postinstall de la raíz, que `deploy
 # --prod` no ejecuta (prisma es devDependency): se copia el ya generado.
 && generated="$(dirname "$(find /repo/node_modules/.pnpm -path '*/node_modules/.prisma/client/schema.prisma' | head -n1)")" \
 && test -f "$generated/schema.prisma" \
 && for dest in /out/api/node_modules/.pnpm/@prisma+client@*/node_modules; do \
      rm -rf "$dest/.prisma/client" && mkdir -p "$dest/.prisma" && cp -r "$generated" "$dest/.prisma/client"; \
    done \
 # Comprueba que quedó el cliente generado (con el esquema), no el stub por defecto.
 && ls /out/api/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/schema.prisma \
 && ls /out/api/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node

FROM base AS migrate
COPY --from=build /repo /repo
USER node
ENTRYPOINT ["/repo/deploy/scripts/migrate.sh"]

FROM ${NODE_IMAGE} AS runtime
ARG APT_PACKAGES
# Fuentes para la tarjeta de redes de la comunidad (sharp/librsvg dibuja el
# texto con fontconfig; la imagen slim no trae ninguna fuente).
ARG FONT_PACKAGES="fonts-inter fonts-dejavu-core"
ENV NODE_ENV=production
RUN if [ -n "$APT_PACKAGES$FONT_PACKAGES" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends $APT_PACKAGES $FONT_PACKAGES \
      && rm -rf /var/lib/apt/lists/*; \
    fi \
 && mkdir -p /var/lib/adoptafacil/storage \
 && chown -R node:node /var/lib/adoptafacil
WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1)).catch(()=>process.exit(1))"
# Señales y procesos zombi: compose arranca el contenedor con `init: true`.
CMD ["node", "dist/src/main.js"]

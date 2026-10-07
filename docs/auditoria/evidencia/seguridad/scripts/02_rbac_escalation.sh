#!/bin/bash
source ${AUDIT_DIR:-./auditoria-seguridad}/scripts/env.sh
source $SEC/evidencia/actors.env
req() { echo "### $1 $2 $3 (as $4)"; curl -s -o /tmp/r.$$ -w "HTTP %{http_code}\n" -X $1 "$API$2" -H "authorization: Bearer ${!4}" -H 'content-type: application/json' ${3:+-d "$3"}; head -c 400 /tmp/r.$$; echo; }
echo "== AF-007 Administrator se auto-asigna Owner"
req POST /rbac/roles "{\"userId\":\"$ADMIN_A_ID\",\"role\":\"owner\"}" USER_A_ADMIN
echo "== Administrator asigna PlatformSuperAdmin (debe 400)"
req POST /rbac/roles "{\"userId\":\"$ADMIN_A_ID\",\"role\":\"platform_super_admin\"}" USER_A_ADMIN
echo "== Operator intenta asignarse Administrator"
req POST /rbac/roles "{\"userId\":\"$OP_A_ID\",\"role\":\"administrator\"}" USER_A_LOW
echo "== ReadOnlyAuditor intenta escribir (asignar rol / editar perfil / crear animal)"
req POST /rbac/roles "{\"userId\":\"$AUDITOR_A_ID\",\"role\":\"administrator\"}" AUDITOR_A
req POST /animals '{"name":"x","species":"dog"}' AUDITOR_A
echo "== Owner A asigna rol a usuario de B (cross-tenant)"
req POST /rbac/roles "{\"userId\":\"$LOW_B_ID\",\"role\":\"administrator\"}" OWNER_A
echo "== my-roles admin"
req GET /rbac/my-roles "" USER_A_ADMIN
echo "== AF-008: admin (ahora Owner) revoca Owner del Owner original; luego el ultimo Owner se revoca a si mismo"
req DELETE /rbac/roles/$OWNER_A_ID/owner "" USER_A_ADMIN
req GET /rbac/roles "" USER_A_ADMIN
req DELETE /rbac/roles/$ADMIN_A_ID/owner "" USER_A_ADMIN
req GET /rbac/my-roles "" USER_A_ADMIN
echo "== Revoke con rol arbitrario (no-enum) y userId no-uuid"
req DELETE /rbac/roles/not-a-uuid/whatever "" OWNER_B

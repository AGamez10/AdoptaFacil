#!/bin/bash
# Crea actores TENANT_A/TENANT_B/USER_A_LOW/USER_A_ADMIN/USER_B_LOW/SUPERADMIN (+auxiliares)
source ${AUDIT_DIR:-./auditoria-seguridad}/scripts/env.sh
export PGPASSWORD=adoptafacil
PSQL="psql -h localhost -p 5433 -U adoptafacil -d adoptafacil_sec -X -A -t -q"
PW='Sec-Audit-Pass-2026!'
OUT=$SEC/evidencia/actors.env; : > $OUT
reg() { # kind email name [orgname]
  if [ "$1" = org ]; then body="{\"organizationName\":\"$4\",\"displayName\":\"$3\",\"email\":\"$2\",\"password\":\"$PW\"}"; path=organization;
  else body="{\"displayName\":\"$3\",\"email\":\"$2\",\"password\":\"$PW\"}"; path=person; fi
  curl -s -X POST $API/auth/register/$path -H 'content-type: application/json' -d "$body"
}
login() { curl -s -X POST $API/auth/login -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | jq -r .tokens.accessToken; }
r=$(reg org owner.a@tenant-a.test "Owner A" "Refugio Tenant A"); echo "OWNER_A=$(echo $r|jq -r .tokens.accessToken)" >>$OUT; echo "ORG_A=$(echo $r|jq -r .user.organizationId)" >>$OUT; echo "OWNER_A_ID=$(echo $r|jq -r .user.id)" >>$OUT
r=$(reg org owner.b@tenant-b.test "Owner B" "Refugio Tenant B"); echo "OWNER_B=$(echo $r|jq -r .tokens.accessToken)" >>$OUT; echo "ORG_B=$(echo $r|jq -r .user.organizationId)" >>$OUT; echo "OWNER_B_ID=$(echo $r|jq -r .user.id)" >>$OUT
source $OUT
for u in admin.a op.a auditor.a vet.a volunteer.a; do r=$(reg person $u@tenant-a.test "$u"); id=$(echo $r|jq -r .user.id); po=$(echo $r|jq -r .user.organizationId)
  $PSQL -c "update users set organization_id='$ORG_A' where id='$id'; update auth_credentials set organization_id='$ORG_A', account_type='organization' where user_id='$id'; update users set account_type='organization' where id='$id';"
  echo "$(echo $u|tr a-z. A-Z_)_ID=$id" >> $OUT; done
r=$(reg person low.b@tenant-b.test "low.b"); id=$(echo $r|jq -r .user.id)
$PSQL -c "update users set organization_id='$ORG_B', account_type='organization' where id='$id'; update auth_credentials set organization_id='$ORG_B', account_type='organization' where user_id='$id';"
echo "LOW_B_ID=$id" >> $OUT
r=$(reg person person.p@people.test "Persona Adoptante"); echo "PERSON_P=$(echo $r|jq -r .tokens.accessToken)" >>$OUT; echo "PERSON_P_ID=$(echo $r|jq -r .user.id)" >>$OUT
r=$(reg person person.q@people.test "Persona Q"); echo "PERSON_Q=$(echo $r|jq -r .tokens.accessToken)" >>$OUT; echo "PERSON_Q_ID=$(echo $r|jq -r .user.id)" >>$OUT
source $OUT
assign() { curl -s -X POST $API/rbac/roles -H "authorization: Bearer $1" -H 'content-type: application/json' -d "{\"userId\":\"$2\",\"role\":\"$3\"}"; echo; }
assign $OWNER_A $ADMIN_A_ID administrator
assign $OWNER_A $OP_A_ID operator
assign $OWNER_A $AUDITOR_A_ID read_only_auditor
assign $OWNER_A $VET_A_ID veterinarian
assign $OWNER_A $VOLUNTEER_A_ID volunteer
assign $OWNER_B $LOW_B_ID operator
sleep 61
echo "USER_A_ADMIN=$(login admin.a@tenant-a.test)" >>$OUT
echo "USER_A_LOW=$(login op.a@tenant-a.test)" >>$OUT
echo "AUDITOR_A=$(login auditor.a@tenant-a.test)" >>$OUT
echo "VET_A=$(login vet.a@tenant-a.test)" >>$OUT
echo "VOLUNTEER_A=$(login volunteer.a@tenant-a.test)" >>$OUT
sleep 61
echo "USER_B_LOW=$(login low.b@tenant-b.test)" >>$OUT
echo "SUPERADMIN=$(curl -s -X POST $API/auth/login -H 'content-type: application/json' -d '{"email":"admin@adoptafacil.local","password":"changeme123"}' | jq -r .tokens.accessToken)" >>$OUT
echo "SUPERADMIN_ID=$($PSQL -c "select user_id from auth_credentials where email='admin@adoptafacil.local'")" >>$OUT
cat $OUT | cut -c1-60

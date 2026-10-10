#!/bin/bash
source ${AUDIT_DIR:-./auditoria-seguridad}/scripts/env.sh
cd /tmp  # avoid loading repo-root .env via cwd
nohup node /home/claude/AdoptaFacil/apps/api/dist/src/main.js > $SEC/evidencia/api.log 2>&1 &
echo $! > $SEC/evidencia/api.pid

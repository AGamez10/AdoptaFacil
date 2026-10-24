#!/bin/bash
S=${AUDIT_DIR:-./auditoria-seguridad}
[ -f $S/evidencia/api.pid ] && kill $(cat $S/evidencia/api.pid) 2>/dev/null; sleep 1

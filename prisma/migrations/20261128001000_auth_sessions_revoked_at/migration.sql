-- Auditoría run-4 RA-01: un access token (15 min) emitido ANTES de restablecer
-- la contraseña o del primer vínculo con Google seguía funcionando hasta
-- vencer. Esta marca dice "toda sesión emitida antes de este instante quedó
-- revocada"; JwtAuthGuard rechaza los tokens con `iat` anterior.
ALTER TABLE "auth_credentials" ADD COLUMN "sessions_revoked_at" TIMESTAMP(3);

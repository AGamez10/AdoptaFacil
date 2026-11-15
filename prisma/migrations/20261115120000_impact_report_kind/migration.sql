-- El reporte de impacto queda sellado en el historial de reportes (folio, QR
-- de verificacion y SHA-256), igual que los demas. Es siempre informativo:
-- no tiene firmantes ni politica de firmas.
ALTER TABLE "org_reports" DROP CONSTRAINT "org_reports_kind_check";
ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_kind_check"
  CHECK ("kind" IN ('donations', 'social_service', 'accounting', 'impact'));

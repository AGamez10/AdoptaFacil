-- P0-2 (auditoría de lógica de negocio, 2026-11-06): un certificado de
-- voluntariado lo firma QUIEN FIRMA POR LA ORGANIZACIÓN al emitirlo, y esa
-- firma queda congelada. Antes el PDF dibujaba en cada descarga la firma del
-- representante VIGENTE, así que un certificado ya entregado cambiaba de
-- firmante si la organización registraba a otra persona después.
--
-- Columnas nulas a propósito: los certificados emitidos antes de este cambio
-- no tienen firmante congelado y se muestran "sin firma" en lugar de
-- atribuirles una firma que nunca aprobaron.
ALTER TABLE "volunteer_certificates"
  ADD COLUMN "signer_legal_representative_id" UUID,
  ADD COLUMN "signer_signature_hash" TEXT,
  ADD COLUMN "signer_full_name" TEXT,
  ADD COLUMN "signer_position" TEXT,
  ADD COLUMN "signer_is_legal_representative" BOOLEAN;

ALTER TABLE "volunteer_certificates"
  ADD CONSTRAINT "volunteer_certificates_signer_complete_chk" CHECK (
    (
      "signer_legal_representative_id" IS NULL
      AND "signer_signature_hash" IS NULL
      AND "signer_full_name" IS NULL
      AND "signer_position" IS NULL
      AND "signer_is_legal_representative" IS NULL
    )
    OR (
      "signer_legal_representative_id" IS NOT NULL
      AND "signer_signature_hash" IS NOT NULL
      AND "signer_full_name" IS NOT NULL
      AND "signer_position" IS NOT NULL
      AND "signer_is_legal_representative" IS NOT NULL
    )
  );

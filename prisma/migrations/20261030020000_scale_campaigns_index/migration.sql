-- Escala (plan de escala, cambio 11 · bloqueo B8): el listado público nacional
-- de campañas (`public_campaigns`) filtra por status = 'active' y ordena por
-- created_at DESC entre TODAS las organizaciones; solo había índices que
-- empiezan por organization_id. Este índice sirve ese orden sin ordenar en
-- memoria.
CREATE INDEX IF NOT EXISTS "campaigns_status_created_at_idx"
  ON "campaigns" ("status", "created_at" DESC, "id" DESC);

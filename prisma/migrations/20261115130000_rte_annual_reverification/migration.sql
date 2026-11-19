-- Reverificación anual del RTE (ET art. 364-5): hasta cuándo vale el RTE que la
-- plataforma reconoció. Al vencer sin un RUT nuevo aprobado, `rte_vigente` pasa
-- a false (se suspenden solo los certificados con beneficio tributario; no se
-- borra nada).
ALTER TABLE "organization_profiles" ADD COLUMN "rte_valid_until" TIMESTAMP(3);

-- Las ESAL con RTE vigente que ya existen quedan hasta el próximo plazo anual
-- (30 de junio de 2027, 23:59:59 hora de Colombia = 2027-07-01 04:59:59 UTC):
-- reciben los avisos de 60 y 30 días como cualquier otra.
UPDATE "organization_profiles"
SET "rte_valid_until" = TIMESTAMP '2027-07-01 04:59:59'
WHERE "formalization_state" = 'esal_rte' AND "rte_vigente" = true;

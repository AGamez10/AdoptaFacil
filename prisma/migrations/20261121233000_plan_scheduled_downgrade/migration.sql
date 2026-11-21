-- Bajada de plan programada (decisión del dueño, 2026-11-21): quien tiene Pro
-- pagado y elige Crece conserva Pro hasta el fin de lo pagado; Crece empieza
-- ese día con su primer cobro. La tabla ya tiene RLS (ENABLE + FORCE + policy).
ALTER TABLE "organization_subscriptions"
  ADD COLUMN "scheduled_plan" TEXT,
  ADD COLUMN "scheduled_provider_reference" TEXT;

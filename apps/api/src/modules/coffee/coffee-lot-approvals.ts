import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CoffeeCampaignOption,
  CoffeeLotCampaignPayload,
  CoffeeLotPublishPayload,
} from '@adoptafacil/contracts';

type Tx = Prisma.TransactionClient;

/**
 * The two coffee decisions that need four eyes (platform-workspace runs them
 * inside the approval's transaction, under the team's RLS): publishing a lot
 * with its exact terms, and changing the campaign a lot suggests. Each sold
 * bag keeps the campaign it was paid with, so neither touches past orders.
 */

/** An active campaign of an approved organization, or null. */
export async function coffeeCampaignOption(
  tx: Tx | Prisma.TransactionClient,
  campaignId: string,
): Promise<CoffeeCampaignOption | null> {
  const rows = await tx.$queryRaw<Array<{ data: CoffeeCampaignOption | null }>>(
    Prisma.sql`SELECT coffee_campaign_option(${campaignId}::uuid) AS data`,
  );
  return rows[0]?.data ?? null;
}

async function requireActiveCampaign(tx: Tx, campaignId: string): Promise<CoffeeCampaignOption> {
  const campaign = await coffeeCampaignOption(tx, campaignId);
  if (!campaign) {
    throw new BadRequestException(
      'La campaña ya no está activa. Elige otra campaña activa de una organización aprobada.',
    );
  }
  return campaign;
}

async function lockLot(tx: Tx, lotId: string) {
  // RLS: only the team's own lots are visible; FOR UPDATE serializes approvals.
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM coffee_lots WHERE id = ${lotId}::uuid FOR UPDATE`,
  );
  if (!rows[0]) throw new NotFoundException('Ese lote no es de tu equipo.');
  return tx.coffeeLot.findUniqueOrThrow({ where: { id: lotId } });
}

function assertSameTerms(
  lot: {
    salePriceCop: number;
    unitCostCop: number;
    shippingFeeCop: number;
    stockUnits: number;
    defaultCampaignId: string | null;
  },
  payload: CoffeeLotPublishPayload,
): void {
  if (
    lot.salePriceCop !== payload.salePriceCop ||
    lot.unitCostCop !== payload.unitCostCop ||
    lot.shippingFeeCop !== payload.shippingFeeCop ||
    lot.stockUnits !== payload.stockUnits ||
    lot.defaultCampaignId !== payload.defaultCampaignId
  ) {
    throw new ConflictException(
      'El lote cambió después de pedir la aprobación. Pide una nueva con los datos actuales.',
    );
  }
}

export async function precheckCoffeeLotPublish(
  tx: Tx,
  payload: CoffeeLotPublishPayload,
): Promise<void> {
  const lot = await tx.coffeeLot.findUnique({ where: { id: payload.lotId } });
  if (!lot) throw new NotFoundException('Ese lote no es de tu equipo.');
  if (lot.status !== 'draft') throw new ConflictException('Ese lote ya fue publicado.');
  assertSameTerms(lot, payload);
  await requireActiveCampaign(tx, payload.defaultCampaignId);
}

export async function executeCoffeeLotPublish(
  tx: Tx,
  payload: CoffeeLotPublishPayload,
): Promise<Record<string, unknown>> {
  const lot = await lockLot(tx, payload.lotId);
  if (lot.status !== 'draft') throw new ConflictException('Ese lote ya fue publicado.');
  assertSameTerms(lot, payload);
  await requireActiveCampaign(tx, payload.defaultCampaignId);
  await tx.coffeeLot.update({
    where: { id: lot.id },
    data: { status: 'on_sale', publishedAt: new Date() },
  });
  return { lotId: lot.id, defaultCampaignId: payload.defaultCampaignId };
}

export async function precheckCoffeeLotCampaign(
  tx: Tx,
  payload: CoffeeLotCampaignPayload,
): Promise<void> {
  const lot = await tx.coffeeLot.findUnique({ where: { id: payload.lotId } });
  if (!lot) throw new NotFoundException('Ese lote no es de tu equipo.');
  if (lot.status === 'draft') {
    throw new BadRequestException('En borrador la campaña se cambia editando el lote.');
  }
  if (lot.status === 'closed') throw new ConflictException('Ese lote está cerrado.');
  if (lot.defaultCampaignId === payload.campaignId) {
    throw new ConflictException('El lote ya sugiere esa campaña.');
  }
  await requireActiveCampaign(tx, payload.campaignId);
}

export async function executeCoffeeLotCampaign(
  tx: Tx,
  payload: CoffeeLotCampaignPayload,
): Promise<Record<string, unknown>> {
  const lot = await lockLot(tx, payload.lotId);
  if (lot.status === 'draft' || lot.status === 'closed') {
    throw new ConflictException('Ese lote ya no admite cambio de campaña.');
  }
  await requireActiveCampaign(tx, payload.campaignId);
  await tx.coffeeLot.update({
    where: { id: lot.id },
    data: { defaultCampaignId: payload.campaignId },
  });
  return {
    lotId: lot.id,
    previousCampaignId: lot.defaultCampaignId,
    campaignId: payload.campaignId,
  };
}

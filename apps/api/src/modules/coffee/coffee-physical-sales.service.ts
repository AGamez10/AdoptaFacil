import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CoffeePhysicalSale } from '@prisma/client';
import {
  coffeeContributionPerUnit,
  type CoffeePhysicalSaleCampaignSource,
  type CoffeePhysicalSaleKind,
  type CoffeePhysicalSaleView,
  type CreateCoffeePhysicalSaleInput,
  type ReverseCoffeePhysicalSaleInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { fromDbDate, toDbDate, todayInColombia } from '../custody/custody.util';
import { coffeeCampaignOption, lockCoffeeLot } from './coffee-lot-approvals';

type Tx = Prisma.TransactionClient;

/** Lotes donde se puede vender en persona: publicados (a la venta o en pausa). */
const SELLABLE_LOT_STATUSES = ['on_sale', 'paused'];

/**
 * Ventas físicas de café (feria, punto de venta, entrega en mano), registradas
 * por el equipo de plataforma bajo su RLS.
 *
 * Cada venta descuenta bolsas del lote (nunca más de las disponibles: el lote
 * se bloquea con el mismo candado que el checkout y los pagos), suma su aporte
 * con la regla del lote a la campaña que eligió el comprador o, si no eligió,
 * a la sugerida del lote, y queda en la bitácora. La tabla es de solo
 * inserción: una venta mal registrada se anula con un reverso que la espeja,
 * una sola vez, con su motivo. La base de datos vuelve a comprobar stock,
 * estado del lote y que el reverso espeje la venta (trigger).
 */
@Injectable()
export class CoffeePhysicalSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(lotId?: string): Promise<CoffeePhysicalSaleView[]> {
    const rows = await this.prisma.withTenant((tx) =>
      tx.coffeePhysicalSale.findMany({
        where: lotId ? { lotId } : {},
        include: {
          lot: { select: { lotCode: true, product: { select: { name: true } } } },
          reversal: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    );
    return rows.map((s) => ({
      id: s.id,
      lotId: s.lotId,
      productName: s.lot.product.name,
      lotCode: s.lot.lotCode,
      kind: s.kind as CoffeePhysicalSaleKind,
      reversesSaleId: s.reversesSaleId,
      reversedById: s.reversal?.id ?? null,
      quantity: s.quantity,
      unitPriceCop: s.unitPriceCop,
      totalCop: s.totalCop,
      contributionPerUnitCop: s.contributionPerUnitCop,
      contributionTotalCop: s.contributionTotalCop,
      campaignId: s.campaignId,
      campaignTitle: s.campaignTitle,
      organizationName: s.campaignOrgName,
      campaignSource: s.campaignSource as CoffeePhysicalSaleCampaignSource,
      soldOn: fromDbDate(s.soldOn),
      note: s.note,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async record(
    actor: RequestUser,
    lotId: string,
    input: CreateCoffeePhysicalSaleInput,
  ): Promise<void> {
    if (input.soldOn > todayInColombia()) {
      throw new BadRequestException('La fecha de la venta no puede ser futura.');
    }
    await this.prisma.withTenant(async (tx) => {
      const lot = await lockCoffeeLot(tx, lotId);
      if (!SELLABLE_LOT_STATUSES.includes(lot.status)) {
        throw new ConflictException(
          'Solo se registran ventas de un lote publicado (a la venta o en pausa).',
        );
      }

      const campaignId = input.campaignId ?? lot.defaultCampaignId;
      const campaign = campaignId ? await coffeeCampaignOption(tx, campaignId) : null;
      if (!campaign) {
        throw new BadRequestException(
          input.campaignId
            ? 'Esa campaña ya no está activa. Elige otra campaña activa de una organización aprobada.'
            : 'La campaña sugerida del lote ya no está activa: elige la campaña del aporte.',
        );
      }
      const campaignSource: CoffeePhysicalSaleCampaignSource =
        campaign.id === lot.defaultCampaignId ? 'lot_default' : 'buyer';

      const available = await this.available(tx, lot.id);
      if (input.quantity > available) {
        throw new ConflictException(
          available > 0
            ? `Solo quedan ${available} bolsas disponibles en este lote.`
            : 'Este lote ya no tiene bolsas disponibles.',
        );
      }

      const perUnit = coffeeContributionPerUnit(
        input.unitPriceCop,
        lot.unitCostCop,
        lot.contributionBps,
      );
      const sale = await tx.coffeePhysicalSale.create({
        data: {
          organizationId: actor.organizationId,
          lotId: lot.id,
          kind: 'sale',
          quantity: input.quantity,
          unitPriceCop: input.unitPriceCop,
          totalCop: input.unitPriceCop * input.quantity,
          contributionPerUnitCop: perUnit,
          contributionTotalCop: perUnit * input.quantity,
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          campaignOrgName: campaign.organizationName,
          campaignSource,
          soldOn: toDbDate(input.soldOn),
          note: input.note?.trim() || null,
          createdByUserId: actor.id,
        },
      });
      // La nota es texto libre: en la bitácora solo si existe, nunca su contenido.
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'coffee.physical_sale_recorded',
        entityType: 'coffee_physical_sale',
        entityId: sale.id,
        metadata: {
          lotId: lot.id,
          quantity: sale.quantity,
          unitPriceCop: sale.unitPriceCop,
          totalCop: sale.totalCop,
          contributionTotalCop: sale.contributionTotalCop,
          campaignId: sale.campaignId,
          campaignSource,
          soldOn: input.soldOn,
          availableBefore: available,
          hasNote: sale.note !== null,
        },
      });
    });
  }

  /** Anula por completo una venta física, una sola vez, con su motivo. */
  async reverse(
    actor: RequestUser,
    saleId: string,
    input: ReverseCoffeePhysicalSaleInput,
  ): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const found = await tx.coffeePhysicalSale.findUnique({
        where: { id: saleId },
        select: { lotId: true },
      });
      if (!found) throw new NotFoundException('Esa venta no es de tu equipo.');
      // Mismo orden de candados que el checkout y las ventas: primero el lote.
      await lockCoffeeLot(tx, found.lotId);
      const sale = await tx.coffeePhysicalSale.findUniqueOrThrow({
        where: { id: saleId },
        include: { reversal: { select: { id: true } } },
      });
      if (sale.kind !== 'sale') throw new ConflictException('Un reverso no se puede anular.');
      if (sale.reversal) throw new ConflictException('Esa venta ya fue anulada.');

      let reversal: CoffeePhysicalSale;
      try {
        reversal = await tx.coffeePhysicalSale.create({
          data: {
            organizationId: actor.organizationId,
            lotId: sale.lotId,
            kind: 'reversal',
            reversesSaleId: sale.id,
            quantity: -sale.quantity,
            unitPriceCop: sale.unitPriceCop,
            totalCop: -sale.totalCop,
            contributionPerUnitCop: sale.contributionPerUnitCop,
            contributionTotalCop: -sale.contributionTotalCop,
            campaignId: sale.campaignId,
            campaignTitle: sale.campaignTitle,
            campaignOrgName: sale.campaignOrgName,
            campaignSource: sale.campaignSource,
            soldOn: sale.soldOn,
            note: input.reason.trim(),
            createdByUserId: actor.id,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Esa venta ya fue anulada.');
        }
        throw error;
      }
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'coffee.physical_sale_reversed',
        entityType: 'coffee_physical_sale',
        entityId: sale.id,
        metadata: {
          reversalId: reversal.id,
          lotId: sale.lotId,
          quantity: sale.quantity,
          totalCop: sale.totalCop,
          contributionTotalCop: sale.contributionTotalCop,
          campaignId: sale.campaignId,
        },
      });
    });
  }

  /** Bolsas libres del lote (stock − pagadas − apartadas − vendidas en persona). */
  private async available(tx: Tx, lotId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ available: number | null }>>(
      Prisma.sql`SELECT coffee_lot_available(${lotId}::uuid) AS available`,
    );
    return rows[0]?.available ?? 0;
  }
}

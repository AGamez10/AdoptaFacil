import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type CoffeeLot, type CoffeeOrder } from '@prisma/client';
import {
  coffeeContributionPerUnit,
  coffeeQrUrl,
  COFFEE_CONTRIBUTION_BPS,
  type CoffeeCampaignBalance,
  type CoffeeCampaignOption,
  type CoffeeDashboard,
  type CoffeeDeliveryView,
  type CoffeeLotStatus,
  type CoffeeLotView,
  type CoffeeOrderStatus,
  type CoffeeOrderView,
  type CoffeeProductView,
  type CreateCoffeeDeliveryInput,
  type CreateCoffeeLotInput,
  type CreateCoffeeProductInput,
  type UpdateCoffeeLotInput,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CoffeeCheckoutClient } from './coffee-checkout.client';
import { coffeeCampaignOption } from './coffee-lot-approvals';

type Tx = Prisma.TransactionClient;

/** Alfabeto del código impreso: sin 0/1/i/l/o (igual al CHECK de la tabla). */
export const COFFEE_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newCoffeeCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += COFFEE_CODE_ALPHABET[randomInt(COFFEE_CODE_ALPHABET.length)];
  }
  return code;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bolsas que cuentan contra el stock: pagadas y apartadas vigentes. */
export function unitsHeld(
  orders: Pick<CoffeeOrder, 'status' | 'quantity' | 'reservedUntil'>[],
  now: Date = new Date(),
): { sold: number; reserved: number } {
  let sold = 0;
  let reserved = 0;
  for (const o of orders) {
    if (o.status === 'paid') sold += o.quantity;
    else if (o.status === 'pending' && o.reservedUntil > now) reserved += o.quantity;
  }
  return { sold, reserved };
}

export function parseQrDomains(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
}

/**
 * Panel del café para el equipo de plataforma. Todo corre bajo la RLS del
 * equipo (`withTenant`): un equipo nunca ve ni cambia el café de otro. Publicar
 * un lote y cambiar su campaña sugerida NO pasan por aquí: son aprobaciones
 * de cuatro ojos en el espacio de trabajo (`coffee.lot_publish`,
 * `coffee.lot_campaign`).
 */
@Injectable()
export class CoffeeAdminService {
  private readonly qrDomains: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly checkout: CoffeeCheckoutClient,
    config: ConfigService<Env, true>,
  ) {
    const domains = parseQrDomains(config.get('COFFEE_QR_DOMAINS', { infer: true }) as string);
    this.qrDomains = domains.length ? domains : ['adoptafacil.org'];
  }

  async dashboard(): Promise<CoffeeDashboard> {
    return this.prisma.withTenant(async (tx) => {
      const [products, orders, deliveries, visits, pending] = await Promise.all([
        tx.coffeeProduct.findMany({
          include: { lots: { orderBy: { createdAt: 'desc' } } },
          orderBy: { createdAt: 'asc' },
        }),
        tx.coffeeOrder.findMany({
          select: {
            lotId: true,
            status: true,
            quantity: true,
            reservedUntil: true,
            totalCop: true,
            shippingFeeCop: true,
            contributionTotalCop: true,
            campaignId: true,
            campaignTitle: true,
            campaignOrgName: true,
          },
        }),
        tx.coffeeContributionDelivery.groupBy({
          by: ['campaignId'],
          _sum: { amountCop: true },
        }),
        tx.coffeeVisitDay.findMany({
          select: { productId: true, day: true, source: true, visits: true },
        }),
        tx.platformSensitiveAction.findMany({
          where: {
            type: { in: ['coffee.lot_publish', 'coffee.lot_campaign'] },
            expiresAt: { gt: new Date() },
            decisions: { none: {} },
          },
          select: { type: true, payload: true },
        }),
      ]);

      const pendingByLot = new Map<string, CoffeeLotView['pendingApproval']>();
      for (const action of pending) {
        const lotId = (action.payload as { lotId?: unknown }).lotId;
        if (typeof lotId === 'string') {
          pendingByLot.set(lotId, action.type as CoffeeLotView['pendingApproval']);
        }
      }

      const campaignIds = new Set<string>();
      for (const p of products)
        for (const l of p.lots) if (l.defaultCampaignId) campaignIds.add(l.defaultCampaignId);
      const titles = await this.campaignTitles(tx, [...campaignIds]);

      const since = new Date(Date.now() - 30 * DAY_MS);
      const productViews: CoffeeProductView[] = products.map((p) => {
        const mine = visits.filter((v) => v.productId === p.id);
        const sum = (rows: typeof mine, source: string) =>
          rows.filter((v) => v.source === source).reduce((acc, v) => acc + v.visits, 0);
        const recent = mine.filter((v) => v.day >= since);
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          presentationGrams: p.presentationGrams,
          description: p.description,
          qrDomain: p.qrDomain,
          qrUrl: coffeeQrUrl(p.qrDomain, p.code),
          isActive: p.isActive,
          visitsLast30Days: { qr: sum(recent, 'qr'), web: sum(recent, 'web') },
          visitsTotal: { qr: sum(mine, 'qr'), web: sum(mine, 'web') },
          lots: p.lots.map((l) =>
            this.lotView(
              l,
              orders.filter((o) => o.lotId === l.id),
              titles,
              pendingByLot.get(l.id) ?? null,
            ),
          ),
        };
      });

      const balances = new Map<string, CoffeeCampaignBalance>();
      for (const o of orders) {
        if (o.status !== 'paid') continue;
        const b = balances.get(o.campaignId) ?? {
          campaignId: o.campaignId,
          campaignTitle: o.campaignTitle,
          organizationName: o.campaignOrgName,
          committedCop: 0,
          deliveredCop: 0,
          pendingCop: 0,
        };
        b.committedCop += o.contributionTotalCop;
        balances.set(o.campaignId, b);
      }
      for (const d of deliveries) {
        const b = balances.get(d.campaignId);
        if (b) b.deliveredCop += d._sum.amountCop ?? 0;
      }
      for (const b of balances.values()) b.pendingCop = b.committedCop - b.deliveredCop;

      return {
        products: productViews,
        campaigns: [...balances.values()].sort((a, b) => b.pendingCop - a.pendingCop),
        qrDomains: this.qrDomains,
        checkoutEnabled: this.checkout.isConfigured(),
      };
    });
  }

  async campaigns(): Promise<CoffeeCampaignOption[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: CoffeeCampaignOption[] }>>(
      Prisma.sql`SELECT coffee_campaign_options() AS data`,
    );
    return rows[0]?.data ?? [];
  }

  async createProduct(actor: RequestUser, input: CreateCoffeeProductInput): Promise<void> {
    const domain = input.qrDomain.trim().toLowerCase();
    if (!this.qrDomains.includes(domain)) {
      throw new BadRequestException(
        `Ese dominio no está habilitado para el QR. Dominios permitidos: ${this.qrDomains.join(', ')}.`,
      );
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.prisma.withTenant(async (tx) => {
          const product = await tx.coffeeProduct.create({
            data: {
              organizationId: actor.organizationId,
              code: newCoffeeCode(),
              name: input.name.trim(),
              presentationGrams: input.presentationGrams,
              description: input.description?.trim() || null,
              qrDomain: domain,
              createdByUserId: actor.id,
            },
          });
          await this.audit.recordWithTx(tx, {
            organizationId: actor.organizationId,
            actorUserId: actor.id,
            action: 'coffee.product_created',
            entityType: 'coffee_product',
            entityId: product.id,
            metadata: { code: product.code, qrDomain: domain, grams: input.presentationGrams },
          });
        });
        return;
      } catch (error) {
        const clash =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!clash) throw error;
      }
    }
    throw new ConflictException('No se pudo generar un código único. Intenta de nuevo.');
  }

  async createLot(
    actor: RequestUser,
    productId: string,
    input: CreateCoffeeLotInput,
  ): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const product = await tx.coffeeProduct.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Esa presentación no es de tu equipo.');
      await this.requireCampaign(tx, input.defaultCampaignId);
      try {
        const lot = await tx.coffeeLot.create({
          data: {
            organizationId: actor.organizationId,
            productId,
            lotCode: input.lotCode.trim(),
            salePriceCop: input.salePriceCop,
            unitCostCop: input.unitCostCop,
            shippingFeeCop: input.shippingFeeCop,
            stockUnits: input.stockUnits,
            contributionBps: COFFEE_CONTRIBUTION_BPS,
            defaultCampaignId: input.defaultCampaignId,
            createdByUserId: actor.id,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.id,
          action: 'coffee.lot_created',
          entityType: 'coffee_lot',
          entityId: lot.id,
          metadata: {
            productId,
            lotCode: lot.lotCode,
            salePriceCop: lot.salePriceCop,
            unitCostCop: lot.unitCostCop,
            shippingFeeCop: lot.shippingFeeCop,
            stockUnits: lot.stockUnits,
            defaultCampaignId: lot.defaultCampaignId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Esa presentación ya tiene un lote con ese código.');
        }
        throw error;
      }
    });
  }

  /**
   * Borrador: todo se puede cambiar. Publicado: solo el stock, y nunca por
   * debajo de lo vendido más lo apartado. Cerrado: nada.
   */
  async updateLot(actor: RequestUser, lotId: string, input: UpdateCoffeeLotInput): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const lot = await this.lockLot(tx, lotId);
      if (lot.status === 'closed') throw new ConflictException('Ese lote está cerrado.');
      const data: Prisma.CoffeeLotUpdateInput = {};
      if (lot.status === 'draft') {
        if (input.defaultCampaignId !== undefined) {
          await this.requireCampaign(tx, input.defaultCampaignId);
          data.defaultCampaignId = input.defaultCampaignId;
        }
        if (input.lotCode !== undefined) data.lotCode = input.lotCode.trim();
        if (input.salePriceCop !== undefined) data.salePriceCop = input.salePriceCop;
        if (input.unitCostCop !== undefined) data.unitCostCop = input.unitCostCop;
        if (input.shippingFeeCop !== undefined) data.shippingFeeCop = input.shippingFeeCop;
      } else {
        const locked = (
          ['lotCode', 'salePriceCop', 'unitCostCop', 'shippingFeeCop', 'defaultCampaignId'] as const
        ).filter((key) => input[key] !== undefined);
        if (locked.length) {
          throw new ConflictException(
            'Un lote publicado conserva su precio, costo y envío. La campaña sugerida se cambia con una aprobación del equipo.',
          );
        }
      }
      if (input.stockUnits !== undefined) {
        const orders = await tx.coffeeOrder.findMany({
          where: { lotId },
          select: { status: true, quantity: true, reservedUntil: true },
        });
        const { sold, reserved } = unitsHeld(orders);
        if (input.stockUnits < sold + reserved) {
          throw new ConflictException(
            `El stock no puede quedar por debajo de ${sold + reserved} bolsas (vendidas o apartadas).`,
          );
        }
        data.stockUnits = input.stockUnits;
      }
      try {
        await tx.coffeeLot.update({ where: { id: lotId }, data });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Esa presentación ya tiene un lote con ese código.');
        }
        throw error;
      }
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'coffee.lot_updated',
        entityType: 'coffee_lot',
        entityId: lotId,
        metadata: { ...input, previousStatus: lot.status, previousStock: lot.stockUnits },
      });
    });
  }

  /** Pausar, reanudar o cerrar un lote publicado (no cambia sus condiciones). */
  async setLotStatus(
    actor: RequestUser,
    lotId: string,
    action: 'pause' | 'resume' | 'close',
  ): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const lot = await this.lockLot(tx, lotId);
      const next: Record<typeof action, { from: CoffeeLotStatus[]; to: CoffeeLotStatus }> = {
        pause: { from: ['on_sale'], to: 'paused' },
        resume: { from: ['paused'], to: 'on_sale' },
        close: { from: ['draft', 'on_sale', 'paused'], to: 'closed' },
      };
      const rule = next[action];
      if (!rule.from.includes(lot.status as CoffeeLotStatus)) {
        throw new ConflictException('Ese cambio de estado no aplica a este lote.');
      }
      if (action === 'resume' && lot.defaultCampaignId) {
        await this.requireCampaign(tx, lot.defaultCampaignId);
      }
      await tx.coffeeLot.update({
        where: { id: lotId },
        data: { status: rule.to, ...(rule.to === 'closed' ? { closedAt: new Date() } : {}) },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: `coffee.lot_${action}d`,
        entityType: 'coffee_lot',
        entityId: lotId,
        metadata: { from: lot.status, to: rule.to },
      });
    });
  }

  async listOrders(status?: CoffeeOrderStatus): Promise<CoffeeOrderView[]> {
    return this.prisma.withTenant(async (tx) => {
      const now = new Date();
      // `pending` past its reservation is shown as `expired` (the bags are free).
      const where: Prisma.CoffeeOrderWhereInput =
        status === 'pending'
          ? { status: 'pending', reservedUntil: { gt: now } }
          : status === 'expired'
            ? { OR: [{ status: 'expired' }, { status: 'pending', reservedUntil: { lte: now } }] }
            : status
              ? { status }
              : {};
      const rows = await tx.coffeeOrder.findMany({
        where,
        include: { lot: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      return rows.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: (o.status === 'pending' && o.reservedUntil <= now
          ? 'expired'
          : o.status) as CoffeeOrderStatus,
        productName: o.lot.product.name,
        lotCode: o.lot.lotCode,
        quantity: o.quantity,
        unitPriceCop: o.unitPriceCop,
        shippingFeeCop: o.shippingFeeCop,
        totalCop: o.totalCop,
        contributionTotalCop: o.contributionTotalCop,
        campaignTitle: o.campaignTitle,
        organizationName: o.campaignOrgName,
        buyer: {
          fullName: o.buyerName,
          email: o.buyerEmail,
          phone: o.buyerPhone,
          address: o.shippingAddress,
          city: o.shippingCity,
          department: o.shippingDepartment,
        },
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        receiptSentAt: o.receiptSentAt?.toISOString() ?? null,
      }));
    });
  }

  async markShipped(actor: RequestUser, orderId: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const order = await tx.coffeeOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Ese pedido no es de tu equipo.');
      if (order.status !== 'paid') throw new ConflictException('Solo se envían pedidos pagados.');
      if (order.shippedAt) return;
      await tx.coffeeOrder.update({ where: { id: orderId }, data: { shippedAt: new Date() } });
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'coffee.order_shipped',
        entityType: 'coffee_order',
        entityId: orderId,
        metadata: { reference: order.reference },
      });
    });
  }

  async listDeliveries(): Promise<CoffeeDeliveryView[]> {
    const rows = await this.prisma.withTenant((tx) =>
      tx.coffeeContributionDelivery.findMany({ orderBy: { deliveredOn: 'desc' }, take: 500 }),
    );
    return rows.map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      campaignTitle: d.campaignTitle,
      amountCop: d.amountCop,
      deliveredOn: d.deliveredOn.toISOString().slice(0, 10),
      evidence: d.evidence,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  /**
   * Registra una entrega del aporte a una campaña que recibió aportes del café
   * (solo a esas: no se puede "entregar" a una campaña sin compromiso). Una
   * corrección es otra entrega, negativa, con su explicación.
   */
  async createDelivery(actor: RequestUser, input: CreateCoffeeDeliveryInput): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const committed = await tx.coffeeOrder.findFirst({
        where: { campaignId: input.campaignId, status: 'paid' },
        select: { campaignTitle: true },
      });
      if (!committed) {
        throw new BadRequestException('Esa campaña no tiene aportes comprometidos del café.');
      }
      const delivery = await tx.coffeeContributionDelivery.create({
        data: {
          organizationId: actor.organizationId,
          campaignId: input.campaignId,
          campaignTitle: committed.campaignTitle,
          amountCop: input.amountCop,
          deliveredOn: new Date(`${input.deliveredOn}T00:00:00Z`),
          evidence: input.evidence.trim(),
          createdByUserId: actor.id,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: 'coffee.contribution_delivered',
        entityType: 'coffee_contribution_delivery',
        entityId: delivery.id,
        metadata: { campaignId: input.campaignId, amountCop: input.amountCop },
      });
    });
  }

  private async lockLot(tx: Tx, lotId: string): Promise<CoffeeLot> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM coffee_lots WHERE id = ${lotId}::uuid FOR UPDATE`,
    );
    if (!rows[0]) throw new NotFoundException('Ese lote no es de tu equipo.');
    return tx.coffeeLot.findUniqueOrThrow({ where: { id: lotId } });
  }

  private async requireCampaign(tx: Tx, campaignId: string): Promise<CoffeeCampaignOption> {
    const campaign = await coffeeCampaignOption(tx, campaignId);
    if (!campaign) {
      throw new BadRequestException('Elige una campaña activa de una organización aprobada.');
    }
    return campaign;
  }

  /** Títulos de campañas (activas o cerradas) para mostrar la sugerida. */
  private async campaignTitles(tx: Tx, ids: string[]): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    for (const id of ids) {
      const rows = await tx.$queryRaw<Array<{ data: { title?: string } | null }>>(
        Prisma.sql`SELECT public_campaign(${id}::uuid) AS data`,
      );
      const title = rows[0]?.data?.title;
      if (title) titles.set(id, title);
    }
    return titles;
  }

  private lotView(
    l: CoffeeLot,
    orders: Pick<
      CoffeeOrder,
      | 'status'
      | 'quantity'
      | 'reservedUntil'
      | 'totalCop'
      | 'shippingFeeCop'
      | 'contributionTotalCop'
    >[],
    titles: Map<string, string>,
    pendingApproval: CoffeeLotView['pendingApproval'],
  ): CoffeeLotView {
    const { sold, reserved } = unitsHeld(orders);
    const paid = orders.filter((o) => o.status === 'paid');
    return {
      id: l.id,
      productId: l.productId,
      lotCode: l.lotCode,
      status: l.status as CoffeeLotStatus,
      salePriceCop: l.salePriceCop,
      unitCostCop: l.unitCostCop,
      shippingFeeCop: l.shippingFeeCop,
      stockUnits: l.stockUnits,
      contributionBps: l.contributionBps,
      contributionPerUnitCop: coffeeContributionPerUnit(
        l.salePriceCop,
        l.unitCostCop,
        l.contributionBps,
      ),
      defaultCampaignId: l.defaultCampaignId,
      defaultCampaignTitle: l.defaultCampaignId ? (titles.get(l.defaultCampaignId) ?? null) : null,
      unitsSold: sold,
      unitsReserved: reserved,
      availableUnits: Math.max(l.stockUnits - sold - reserved, 0),
      revenueCop: paid.reduce((acc, o) => acc + o.totalCop - o.shippingFeeCop, 0),
      contributionCommittedCop: paid.reduce((acc, o) => acc + o.contributionTotalCop, 0),
      pendingApproval,
      publishedAt: l.publishedAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    };
  }
}

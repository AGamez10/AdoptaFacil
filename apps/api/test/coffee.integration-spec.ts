import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { totpAt } from '../src/core/auth/mfa/totp';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { mercadoPagoSignatureV1 } from '../src/core/payments/mercadopago-payment.adapter';
import {
  CoffeeCheckoutClient,
  type CoffeePaymentReadBack,
} from '../src/modules/coffee/coffee-checkout.client';
import { newCoffeeReference } from '../src/modules/coffee/coffee-public.service';
import { purgeOrganizations } from './support/cleanup';
import { LEGAL_ORG } from './support/legal';
import { approveTestOrganization } from './support/organization-status';
import { createStaffMember, type StaffMember } from './support/platform-team';
import { CapturingNotificationPort } from './support/signers';

const WEBHOOK_SECRET = 'coffee-webhook-secret-test';

/** Mercado Pago with AdoptaFácil's account, simulated: zero network. */
class FakeCoffeeCheckout {
  readonly preferences: Array<{ reference: string; quantity: number; expiresAt: Date }> = [];
  readonly payments = new Map<string, CoffeePaymentReadBack>();
  isConfigured(): boolean {
    return true;
  }
  isTest(): boolean {
    return false;
  }
  async createPreference(input: { reference: string; quantity: number; expiresAt: Date }) {
    this.preferences.push(input);
    return {
      id: `pref-${input.reference}`,
      checkoutUrl: `https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=${input.reference}`,
    };
  }
  async getPayment(id: string): Promise<CoffeePaymentReadBack> {
    const payment = this.payments.get(id);
    if (!payment) throw new Error('not found');
    return payment;
  }
}

/**
 * Café de AdoptaFácil, de punta a punta por HTTP: el equipo crea la
 * presentación (QR fijo) y el lote; publicarlo y cambiar su campaña sugerida
 * exigen a otro líder (cuatro ojos); el comprador escanea, elige la campaña,
 * aparta bolsas sin sobreventa, paga y recibe el comprobante con la campaña y
 * el aporte (20 % del margen bruto).
 */
describe('Café: lotes con QR, checkout con stock y aporte a la campaña elegida', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const mail = new CapturingNotificationPort();
  const mp = new FakeCoffeeCheckout();
  const previous = {
    mfa: process.env.PLATFORM_MFA_REQUIRED,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  };

  let lead1: StaffMember;
  let lead2: StaffMember;
  let otherTeam: StaffMember;
  let ownerToken = '';
  let campaignA = '';
  let campaignB = '';
  let campaignC = '';
  let productCode = '';
  let productId = '';
  let lotId = '';

  const realNow = Date.now.bind(Date);
  let offsetMs = 0;
  const nextCode = (member: StaffMember) => {
    offsetMs += 30_000;
    return totpAt(member.totpSecret!, realNow() + offsetMs);
  };

  const as = (member: { token: string }) => ({
    get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${member.token}`),
    post: (path: string, body: object = {}) =>
      request(server).post(path).set('Authorization', `Bearer ${member.token}`).send(body),
    patch: (path: string, body: object = {}) =>
      request(server).patch(path).set('Authorization', `Bearer ${member.token}`).send(body),
  });

  const buyer = {
    fullName: 'Ana Compradora',
    email: 'ana.compradora@test.local',
    phone: '+57 300 123 4567',
    address: 'Calle 10 # 20-30',
    city: 'Ibagué',
    department: 'Tolima',
  };

  const checkout = (body: Partial<Record<string, unknown>>) =>
    request(server)
      .post(`/public/coffee/${productCode}/checkout`)
      .send({ lotId, quantity: 1, campaignId: campaignA, buyer, acceptPrivacy: true, ...body });

  let paymentSeq = 1000;
  function notifyPayment(
    reference: string,
    status: string,
    amount: number,
    opts: { badSignature?: boolean } = {},
  ) {
    const id = String(paymentSeq++);
    mp.payments.set(id, {
      id,
      status,
      externalReference: reference,
      amount,
      currency: 'COP',
      liveMode: true,
    });
    const ts = String(Math.floor(realNow() / 1000));
    const requestId = randomUUID();
    const v1 = opts.badSignature
      ? 'ab'.repeat(32)
      : mercadoPagoSignatureV1(WEBHOOK_SECRET, id, requestId, ts);
    return request(server)
      .post(`/coffee/webhooks/mercadopago?data.id=${id}&type=payment`)
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .set('x-request-id', requestId)
      .send({ type: 'payment', data: { id } });
  }

  async function approve(requester: StaffMember, approver: StaffMember, body: object) {
    const asked = await as(requester)
      .post('/platform/workspace/approvals', { ...body, reason: 'Lote nuevo de café' })
      .expect(201);
    await as(requester)
      .post(`/platform/workspace/approvals/${asked.body.id}/approve`, { code: nextCode(requester) })
      .expect(403);
    return as(approver).post(`/platform/workspace/approvals/${asked.body.id}/approve`, {
      code: nextCode(approver),
    });
  }

  async function createCampaign(token: string, title: string): Promise<string> {
    const res = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        category: 'surgeries',
        goalAmount: 500_000,
        deadline: '2027-12-31T00:00:00.000Z',
      })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    process.env.PLATFORM_MFA_REQUIRED = 'true';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CoffeeCheckoutClient)
      .useValue(mp)
      .overrideProvider(NOTIFICATION_PORT)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const staff = { enrolled: true, mfaVerified: true };
    lead1 = await createStaffMember(admin, app, { roles: ['platform_super_admin'], ...staff });
    orgIds.push(lead1.orgId);
    lead2 = await createStaffMember(admin, app, {
      teamOrgId: lead1.orgId,
      roles: ['platform_super_admin'],
      ...staff,
    });
    otherTeam = await createStaffMember(admin, app, { roles: ['platform_admin'], ...staff });
    orgIds.push(otherTeam.orgId);

    const owner = await request(server)
      .post('/auth/register/organization')
      .send({
        ...LEGAL_ORG,
        organizationName: 'Fundación Café',
        displayName: 'Owner',
        email: `coffee-owner-${randomUUID()}@test.local`,
        password: 'password-owner-123',
      })
      .expect(201);
    ownerToken = owner.body.tokens.accessToken;
    orgIds.push(owner.body.user.organizationId);
    await approveTestOrganization(admin, owner.body.user.organizationId);
    campaignA = await createCampaign(ownerToken, 'Cirugía de Luna');
    campaignB = await createCampaign(ownerToken, 'Comida para el refugio');
    campaignC = await createCampaign(ownerToken, 'Vacunas de diciembre');
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (previous.mfa === undefined) delete process.env.PLATFORM_MFA_REQUIRED;
    else process.env.PLATFORM_MFA_REQUIRED = previous.mfa;
    if (previous.secret === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = previous.secret;
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('deny-by-default: una organización no entra al panel del café', async () => {
    await as({ token: ownerToken }).get('/platform/coffee').expect(403);
    await as({ token: ownerToken }).post('/platform/coffee/products', {}).expect(403);
  });

  it('el equipo crea la presentación con un QR fijo en un dominio permitido', async () => {
    await as(lead1)
      .post('/platform/coffee/products', {
        name: 'Café San Pedro 250 g',
        presentationGrams: 250,
        qrDomain: 'otrodominio.com',
      })
      .expect(400);
    await as(lead1)
      .post('/platform/coffee/products', {
        name: 'Café San Pedro 250 g',
        presentationGrams: 250,
        qrDomain: 'adoptafacil.org',
      })
      .expect(204);
    const dash = await as(lead1).get('/platform/coffee').expect(200);
    expect(dash.body.products).toHaveLength(1);
    productCode = dash.body.products[0].code;
    productId = dash.body.products[0].id;
    expect(productCode).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
    expect(dash.body.products[0].qrUrl).toBe(`https://adoptafacil.org/c/${productCode}`);
    expect(dash.body.checkoutEnabled).toBe(true);

    // Otro equipo no la ve (RLS).
    const other = await as(otherTeam).get('/platform/coffee').expect(200);
    expect(other.body.products).toHaveLength(0);
  });

  it('el lote nace en borrador con el aporte del 20 % del margen bruto', async () => {
    await as(lead1)
      .post(`/platform/coffee/products/${productId}/lots`, {
        lotCode: 'L2-2026',
        salePriceCop: 27_999,
        unitCostCop: 17_000,
        shippingFeeCop: 0,
        stockUnits: 3,
        defaultCampaignId: campaignA,
      })
      .expect(204);
    const dash = await as(lead1).get('/platform/coffee').expect(200);
    const lot = dash.body.products[0].lots[0];
    lotId = lot.id;
    expect(lot).toMatchObject({
      status: 'draft',
      contributionPerUnitCop: 2_200,
      defaultCampaignTitle: 'Cirugía de Luna',
      availableUnits: 3,
    });

    const offer = await request(server).get(`/public/coffee/${productCode}`).expect(200);
    expect(offer.body.lot).toBeNull();
  });

  it('publicar el lote exige a otro líder del equipo', async () => {
    const res = await approve(lead1, lead2, {
      type: 'coffee.lot_publish',
      payload: {
        lotId,
        salePriceCop: 27_999,
        unitCostCop: 17_000,
        shippingFeeCop: 0,
        stockUnits: 3,
        defaultCampaignId: campaignA,
      },
    });
    expect(res.status).toBe(201);
    const dash = await as(lead1).get('/platform/coffee').expect(200);
    expect(dash.body.products[0].lots[0].status).toBe('on_sale');
  });

  it('un lote publicado conserva su precio y su campaña sugerida', async () => {
    await as(lead1).patch(`/platform/coffee/lots/${lotId}`, { salePriceCop: 20_000 }).expect(409);
    await as(lead1)
      .patch(`/platform/coffee/lots/${lotId}`, { defaultCampaignId: campaignB })
      .expect(409);
  });

  it('quien escanea ve el lote, el aporte y la campaña sugerida; se cuenta la visita', async () => {
    const offer = await request(server).get(`/public/coffee/${productCode}?o=qr`).expect(200);
    expect(offer.body).toMatchObject({
      productName: 'Café San Pedro 250 g',
      lot: {
        id: lotId,
        lotCode: 'L2-2026',
        salePriceCop: 27_999,
        availableUnits: 3,
        contributionPerUnitCop: 2_200,
        suggestedCampaign: { id: campaignA, title: 'Cirugía de Luna' },
      },
    });
    // Nunca costos ni datos internos.
    expect(JSON.stringify(offer.body)).not.toContain('17000');
    const dash = await as(lead1).get('/platform/coffee').expect(200);
    expect(dash.body.products[0].visitsTotal.qr).toBe(1);

    const campaigns = await request(server).get('/public/coffee/campaigns').expect(200);
    const ids = campaigns.body.items.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining([campaignA, campaignB, campaignC]));
  });

  let firstReference = '';

  it('el comprador cambia la campaña, aparta bolsas y no se sobrevende', async () => {
    await checkout({ acceptPrivacy: false }).expect(400);
    const first = await checkout({ quantity: 2, campaignId: campaignB }).expect(201);
    firstReference = first.body.reference;
    expect(first.body.totalCop).toBe(55_998);
    expect(first.body.checkoutUrl).toContain('mercadopago.com.co');
    expect(mp.preferences.at(-1)?.quantity).toBe(2);

    const tooMany = await checkout({ quantity: 2 }).expect(409);
    expect(tooMany.body).toMatchObject({ code: 'OUT_OF_STOCK', availableUnits: 1 });

    // Dos compradores a la vez por la última bolsa: solo uno la aparta.
    const [a, b] = await Promise.all([checkout({}), checkout({})]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const offer = await request(server).get(`/public/coffee/${productCode}`).expect(200);
    expect(offer.body.lot.availableUnits).toBe(0);
  });

  it('si la campaña elegida se cerró, se pide elegir otra', async () => {
    await admin.campaign.update({ where: { id: campaignC }, data: { status: 'closed' } });
    const res = await checkout({ campaignId: campaignC }).expect(409);
    expect(res.body.code).toBe('CAMPAIGN_CLOSED');
  });

  it('el pago aprobado confirma el pedido una sola vez y manda el comprobante', async () => {
    await notifyPayment(firstReference, 'approved', 55_998, { badSignature: true }).expect(403);
    const res = await notifyPayment(firstReference, 'approved', 55_998).expect(200);
    expect(res.body).toEqual({ applied: true });
    const again = await notifyPayment(firstReference, 'approved', 55_998).expect(200);
    expect(again.body).toEqual({ applied: false });

    const receipts = mail.sent.filter((m) => m.template?.event === 'coffee.purchase_receipt');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].to).toBe(buyer.email);
    expect(receipts[0].template?.data).toMatchObject({
      campana: 'Comida para el refugio',
      aporte: 4_400,
      cantidad: 2,
      total: 55_998,
    });

    const status = await request(server).get(`/public/coffee/orders/${firstReference}`).expect(200);
    expect(status.body).toMatchObject({
      status: 'paid',
      campaignTitle: 'Comida para el refugio',
      contributionTotalCop: 4_400,
    });
    expect(JSON.stringify(status.body)).not.toContain(buyer.email);
  });

  it('un pago que llega tarde, cuando ya no hay bolsas, queda para devolución', async () => {
    // El pedido de la última bolsa sigue apartado; uno anterior venció.
    const orders = await admin.coffeeOrder.findMany({
      where: { lotId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders).toHaveLength(1);
    const lateRef = newCoffeeReference();
    await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.coffeeOrder.create({
        data: {
          ...orders[0],
          id: randomUUID(),
          reference: lateRef,
          reservedUntil: new Date(realNow() - 60_000),
          createdAt: undefined,
          updatedAt: undefined,
        },
      });
    });
    const res = await notifyPayment(lateRef, 'approved', 27_999).expect(200);
    expect(res.body).toEqual({ applied: true });
    const late = await admin.coffeeOrder.findUniqueOrThrow({ where: { reference: lateRef } });
    expect(late.status).toBe('needs_refund');
    expect(mail.sent.some((m) => m.idempotencyKey === `coffee.needs_refund:${lateRef}`)).toBe(true);
  });

  it('cambiar la campaña sugerida pasa por doble aprobación y no toca lo ya vendido', async () => {
    const res = await approve(lead1, lead2, {
      type: 'coffee.lot_campaign',
      payload: { lotId, campaignId: campaignB },
    });
    expect(res.status).toBe(201);
    const offer = await request(server).get(`/public/coffee/${productCode}`).expect(200);
    expect(offer.body.lot.suggestedCampaign.id).toBe(campaignB);
    const paid = await admin.coffeeOrder.findUniqueOrThrow({
      where: { reference: firstReference },
    });
    expect(paid.campaignId).toBe(campaignB);
    expect(paid.contributionTotalCop).toBe(4_400);
  });

  it('el equipo ve los pedidos con datos de envío, los marca enviados y registra entregas', async () => {
    const orders = await as(lead1).get('/platform/coffee/orders?status=paid').expect(200);
    expect(orders.body).toHaveLength(1);
    expect(orders.body[0].buyer.address).toBe(buyer.address);
    await as(lead1).post(`/platform/coffee/orders/${orders.body[0].id}/shipped`).expect(204);

    // Llegaron más bolsas: el stock sube, pero nunca por debajo de lo vendido o apartado.
    await as(lead1).patch(`/platform/coffee/lots/${lotId}`, { stockUnits: 2 }).expect(409);
    await as(lead1).patch(`/platform/coffee/lots/${lotId}`, { stockUnits: 4 }).expect(204);

    await as(lead1)
      .post('/platform/coffee/deliveries', {
        campaignId: campaignA,
        amountCop: 1_000,
        deliveredOn: '2026-11-08',
        evidence: 'Transferencia 123',
      })
      .expect(400);
    await as(lead1)
      .post('/platform/coffee/deliveries', {
        campaignId: campaignB,
        amountCop: 4_400,
        deliveredOn: '2026-11-08',
        evidence: 'Transferencia 123',
      })
      .expect(204);

    const dash = await as(lead1).get('/platform/coffee').expect(200);
    expect(dash.body.campaigns).toEqual([
      expect.objectContaining({
        campaignId: campaignB,
        committedCop: 4_400,
        deliveredCop: 4_400,
        pendingCop: 0,
      }),
    ]);
    expect(dash.body.products[0].lots[0]).toMatchObject({ unitsSold: 2, revenueCop: 55_998 });

    const offer = await request(server).get(`/public/coffee/${productCode}`).expect(200);
    expect(offer.body.impact).toEqual({
      unitsSold: 2,
      contributionCommittedCop: 4_400,
      contributionDeliveredCop: 4_400,
    });

    // Otro equipo no ve pedidos ajenos.
    const other = await as(otherTeam).get('/platform/coffee/orders').expect(200);
    expect(other.body).toHaveLength(0);
  });

  it('lo que el comprador aceptó no se puede reescribir, ni con el superusuario', async () => {
    await expect(
      admin.coffeeOrder.update({ where: { reference: firstReference }, data: { totalCop: 1 } }),
    ).rejects.toThrow();
    await expect(
      admin.coffeeLot.update({ where: { id: lotId }, data: { unitCostCop: 1 } }),
    ).rejects.toThrow();
    await expect(
      admin.coffeeProduct.update({ where: { id: productId }, data: { code: 'zzzzzzzz' } }),
    ).rejects.toThrow();
  });
});

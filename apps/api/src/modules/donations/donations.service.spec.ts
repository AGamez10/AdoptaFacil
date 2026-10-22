import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { NotificationPort } from '../../core/notifications/notification.port';
import {
  computeBreakdown,
  currentLegalAcceptanceItems,
  DIRECT_COLLECTION_RATES,
  type PaymentPort,
  requiredGuestLegalDocuments,
} from '@adoptafacil/contracts';
import type { CampaignFundingService } from '../campaigns/campaign-funding.service';
import type { DonationCertificatesService } from './donation-certificates.service';
import { DonationsService } from './donations.service';
import { LegalService } from '../../core/legal/legal.service';
import { encryptEpaycoSecret, loadEpaycoKeysEncryptionKey } from '../payments/epayco-keys-crypto';

interface Harness {
  service: DonationsService;
  queryRaw: jest.Mock;
  record: jest.Mock;
  createCollection: jest.Mock;
  getOrganizationId: jest.Mock;
  withOrgContext: jest.Mock;
  send: jest.Mock;
  donationAccessLinkCreate: jest.Mock;
  donationAccessLinkFindUnique: jest.Mock;
  organizationFindMany: jest.Mock;
  tryIssueForApprovedDonation: jest.Mock;
}

let verifyAndNormalizeWebhookRef: jest.Mock;

function makeService(configValues: Record<string, unknown> = {}): Harness {
  const queryRaw = jest.fn();
  const record = jest.fn().mockResolvedValue({});
  const createCollection = jest.fn().mockResolvedValue({ collectionId: 'col-1' });
  const getOrganizationId = jest.fn();
  const withOrgContext = jest.fn();
  const send = jest.fn().mockResolvedValue(undefined);
  const donationAccessLinkCreate = jest.fn().mockResolvedValue({});
  const donationAccessLinkFindUnique = jest.fn();
  const organizationFindMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    $queryRaw: queryRaw,
    withOrgContext,
    donationAccessLink: {
      create: donationAccessLinkCreate,
      findUnique: donationAccessLinkFindUnique,
    },
    organization: { findMany: organizationFindMany },
  } as unknown as PrismaService;
  const tenant = { getOrganizationId } as unknown as TenantContextService;
  const audit = { record, recordWithTx: jest.fn() } as unknown as AuditService;
  const verifyAndNormalizeWebhook = jest.fn(
    async (payload: {
      collectionId: string;
      status: string;
      eventId?: string;
      amountCharged?: number;
    }) => ({
      eventId: payload.eventId ?? 'evt-1',
      collectionId: payload.collectionId,
      status: payload.status,
      dedupKey: payload.eventId ?? 'evt-1',
      amountCharged: payload.amountCharged,
    }),
  );
  const payment = { createCollection, verifyAndNormalizeWebhook } as unknown as PaymentPort;
  verifyAndNormalizeWebhookRef = verifyAndNormalizeWebhook;
  const notifications = { send } as unknown as NotificationPort;
  const applyApprovedCollection = jest.fn().mockResolvedValue(undefined);
  const tryIssueForApprovedDonation = jest.fn().mockResolvedValue(undefined);
  const campaignFunding = { applyApprovedCollection } as unknown as CampaignFundingService;
  const certificates = { tryIssueForApprovedDonation } as unknown as DonationCertificatesService;
  const config = {
    get: (key: string) =>
      configValues[key] ?? (key === 'PAYMENT_DRIVER' ? 'fake' : 'https://app.test.local'),
  } as unknown as ConfigService<Record<string, unknown>, true>;
  return {
    service: new DonationsService(
      prisma,
      tenant,
      audit,
      payment,
      notifications,
      campaignFunding,
      certificates,
      config,
      new LegalService(prisma, audit, notifications, config),
    ),
    queryRaw,
    record,
    createCollection,
    getOrganizationId,
    withOrgContext,
    send,
    donationAccessLinkCreate,
    donationAccessLinkFindUnique,
    organizationFindMany,
    tryIssueForApprovedDonation,
  };
}

const BASE_INPUT = {
  organizationId: 'org-1',
  intendedAmount: 50_000,
  commissionPayer: 'organization' as const,
  idempotencyKey: 'idem-key-guest-1',
  // Un invitado acepta términos y autorización de datos en el formulario.
  legalAcceptances: currentLegalAcceptanceItems(requiredGuestLegalDocuments()),
};

/**
 * Guest checkout (client requirement, final): donating must never require an
 * account/login. `create(actor, input)` receives `actor: undefined` for a
 * guest (set by `OptionalJwtAuthGuard`, which never rejects the request).
 */
describe('DonationsService.create — guest checkout', () => {
  it('succeeds with no actor when payer.email is present; donor_user_id travels as null', async () => {
    const h = makeService();
    // First $queryRaw call: idempotency pre-check (donation_by_idempotency) → none yet.
    h.queryRaw.mockResolvedValueOnce([]);
    // Third call: create_donation → the inserted row, donor_user_id null.
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'don-1',
        organization_id: 'org-1',
        donor_user_id: null,
        concept_kind: 'organization',
        concept_id: 'org-1',
        commission_payer: 'organization',
        intended_amount: 50_000,
        amount_charged: 50_000,
        currency: 'COP',
        breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
        collection_id: 'col-1',
        idempotency_key: 'idem-key-guest-1',
        status: 'pending',
        payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
        anonymous: false,
        created_at: new Date('2026-09-28T00:00:00.000Z'),
        updated_at: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.donorUserId).toBeNull();
    expect(result.id).toBe('don-1');
    // The raw call's 2nd positional arg (donor_user_id) is null for a guest.
    // (calls[0] = idempotency pre-check, calls[1] = create_donation — see the
    // mocks above; the org's account is read with withOrgContext, not raw SQL.)
    const createCallArgs = h.queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(createCallArgs.values[1]).toBeNull();
    // Audited with actorUserId: null (same precedent as the webhook path).
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null, action: 'donation.created' }),
    );
  });

  it('rechaza al invitado que no aceptó términos y datos, antes de cobrar', async () => {
    const h = makeService();

    await expect(
      h.service.create(undefined, {
        ...BASE_INPUT,
        legalAcceptances: undefined,
        payer: { email: 'guest@test.dev' },
      }),
    ).rejects.toMatchObject({ response: { code: 'LEGAL_ACCEPTANCE_REQUIRED' } });
    expect(h.queryRaw).not.toHaveBeenCalled();
    expect(h.createCollection).not.toHaveBeenCalled();
  });

  it('rejects with BadRequestException when there is no actor and no payer.email', async () => {
    const h = makeService();

    await expect(h.service.create(undefined, { ...BASE_INPUT })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Fails fast — never reaches the idempotency check, the collection, or the DB write.
    expect(h.queryRaw).not.toHaveBeenCalled();
    expect(h.createCollection).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it('accepts an ANONYMOUS guest donation with no payer at all (no email, no receipt link)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]);
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'don-anon',
        organization_id: 'org-1',
        donor_user_id: null,
        concept_kind: 'organization',
        concept_id: 'org-1',
        commission_payer: 'organization',
        intended_amount: 50_000,
        amount_charged: 50_000,
        currency: 'COP',
        breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
        collection_id: 'col-anon',
        idempotency_key: 'idem-key-guest-1',
        status: 'pending',
        payer: null,
        anonymous: true,
        created_at: new Date('2026-09-28T00:00:00.000Z'),
        updated_at: new Date('2026-09-28T00:00:00.000Z'),
      },
    ]);

    const result = await h.service.create(undefined, { ...BASE_INPUT, anonymous: true });

    expect(result.id).toBe('don-anon');
    expect(result.donorUserId).toBeNull();
  });

  it('rejects when payer is provided but without an email', async () => {
    const h = makeService();

    await expect(
      h.service.create(undefined, { ...BASE_INPUT, payer: { fullName: 'Sin correo' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});

/**
 * The MercadoPago checkout redirect bug fix: `PaymentPort.createCollection()`
 * already returns `paymentLinkUrl` — this was discarded before reaching the
 * caller. `create()` must attach it to the JUST-CREATED response only, never
 * persist it, and never attach it on the idempotent-replay short-circuit.
 */
describe('DonationsService.create — paymentLinkUrl (checkout redirect fix)', () => {
  function donationRow() {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-key-guest-1',
      status: 'pending',
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };
  }

  it('attaches the gateway paymentLinkUrl to a freshly-created donation', async () => {
    const h = makeService();
    h.createCollection.mockResolvedValueOnce({
      collectionId: 'col-1',
      paymentLinkUrl: 'https://mp.test/checkout/pref-1',
    });
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check: none yet
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.paymentLinkUrl).toBe('https://mp.test/checkout/pref-1');
  });

  it('never attaches paymentLinkUrl on an idempotent replay (no fresh gateway call)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([donationRow()]); // idempotency pre-check: found

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.paymentLinkUrl).toBeUndefined();
    expect(h.createCollection).not.toHaveBeenCalled();
  });
});

/**
 * T-OrdersAPI regression (2026-10-01): `create_donation` always seeds
 * 'pending' (the webhook is the sole, exactly-once writer of a terminal
 * status, and its `WHERE status = 'pending'` guard also gates receipt
 * issuance — see `apply_donation_webhook`). But a real card decline
 * discovered live showed the gateway's SYNCHRONOUS response already knows
 * the outcome, and it was being silently discarded — the donor saw a
 * misleading "confirmando tu pago" instead of "tu pago no fue aprobado" for
 * an already-failed charge. `create()` must surface a DECLINE in ITS OWN
 * RETURN VALUE ONLY (never written to the DB here). An 'approved' outcome is
 * deliberately NOT surfaced the same way (regression found via CI,
 * 2026-10-01): `FakePaymentAdapter.createCollection` always returns
 * 'approved', so eagerly trusting it here made every donation in the
 * integration suite appear already-settled before the webhook ever ran,
 * breaking the "pending → webhook → approved" flow those tests verify.
 */
describe('DonationsService.create — surfaces a synchronously-known gateway outcome (T-OrdersAPI)', () => {
  function donationRow() {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-key-guest-1',
      status: 'pending', // the DB row is ALWAYS this, regardless of collection.status
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };
  }

  it('returns status "declined" when the gateway already knows the card was rejected', async () => {
    const h = makeService();
    h.createCollection.mockResolvedValueOnce({ collectionId: 'col-1', status: 'declined' });
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check: none yet
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.status).toBe('declined');
  });

  it('does NOT surface an "approved" gateway outcome immediately — stays "pending" like the DB row (regression: FakePaymentAdapter always returns approved)', async () => {
    const h = makeService();
    h.createCollection.mockResolvedValueOnce({ collectionId: 'col-1', status: 'approved' });
    h.queryRaw.mockResolvedValueOnce([]);
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.status).toBe('pending');
  });

  it('falls back to the DB row\'s "pending" status for any non-terminal gateway outcome', async () => {
    const h = makeService();
    h.createCollection.mockResolvedValueOnce({ collectionId: 'col-1', status: 'pending' });
    h.queryRaw.mockResolvedValueOnce([]);
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    const result = await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    expect(result.status).toBe('pending');
  });
});

/**
 * `create()` passes the request's (optional) tokenized card fields through to
 * `PaymentPort.createCollection` untouched, and never charges with a platform
 * account (ADR-PAG-001). Mercado Pago (and its per-org `collector`) was
 * retired on 2026-10-17: no driver resolves a Mercado Pago account any more.
 */
describe('DonationsService.create — direct collection + card passthrough', () => {
  function donationRow() {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-key-guest-1',
      status: 'pending',
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:00:00.000Z'),
    };
  }

  it('fake driver: passes the card fields through and never resolves a Mercado Pago collector', async () => {
    const h = makeService();
    h.withOrgContext.mockImplementation(async (_orgId, fn) =>
      // Prueba de la aceptación del invitado (Ley 1581), en la misma org.
      fn({ legalAcceptance: { createMany: jest.fn() } }),
    );
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check: none yet
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      cardToken: 'tok-abc',
      paymentMethodId: 'visa',
      installments: 1,
    });

    const input = h.createCollection.mock.calls[0][0];
    expect(input).toEqual(
      expect.objectContaining({ cardToken: 'tok-abc', paymentMethodId: 'visa', installments: 1 }),
    );
    expect(input.collector).toBeUndefined();
    expect(input.epaycoCollector).toBeUndefined();
    expect(input.sponsorMpUserId).toBeUndefined();
    const sql = h.queryRaw.mock.calls
      .map((call) => (call[0] as { strings: string[] }).strings.join('?'))
      .join('\n');
    expect(sql).not.toMatch(/mercadopago/i);
  });

  it('persists a breakdown with NO platform fee (direct collection, ADR-PAG-001)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]);
    h.queryRaw.mockResolvedValueOnce([donationRow()]);

    await h.service.create(undefined, {
      ...BASE_INPUT,
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    });

    const createCallArgs = h.queryRaw.mock.calls[1][0] as { values: unknown[] };
    const breakdown = JSON.parse(createCallArgs.values[7] as string);
    expect(breakdown.platformFee).toBe(0);
    expect(breakdown.platformIva).toBe(0);
  });

  it('with a non-fake driver, refuses an org that has not connected its own account (no platform fallback)', async () => {
    const h = makeService({ PAYMENT_DRIVER: 'disabled' });
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check: none yet

    await expect(
      h.service.create(undefined, {
        ...BASE_INPUT,
        payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.createCollection).not.toHaveBeenCalled();
  });
});

/**
 * PUBLIC "gracias" lookup (gateway redirect-back) — resolves by
 * `collectionId` (== the payer's `external_reference`), never distinguishes
 * an unknown reference from any other 404 reason.
 */
describe('DonationsService.getPublicStatusByCollectionId', () => {
  it('returns status/amount/currency/organizationName for a known collectionId', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'don-1',
        organization_id: 'org-1',
        status: 'approved',
        amount_charged: 50_000,
        currency: 'COP',
      },
    ]);
    h.organizationFindMany.mockResolvedValueOnce([{ id: 'org-1', name: 'Refugio Patitas' }]);

    const result = await h.service.getPublicStatusByCollectionId('col-1');

    expect(result).toEqual({
      status: 'approved',
      amountCharged: 50_000,
      currency: 'COP',
      organizationName: 'Refugio Patitas',
    });
  });

  it('throws a generic NotFoundException for an unknown collectionId', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]);

    await expect(h.service.getPublicStatusByCollectionId('does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/**
 * Org-facing anonymity (separate from guest checkout): `anonymous: true` on a
 * donation must mask the donor's identity from `GET /donations/received`
 * (`payer` + `receipt.donor`) WITHOUT touching what is persisted — amount/
 * date/status/breakdown stay exactly as stored.
 */
describe('DonationsService.listReceived — org-facing anonymity masking', () => {
  function donationModel(overrides: Record<string, unknown> = {}) {
    return {
      id: 'don-1',
      organizationId: 'org-1',
      donorUserId: 'donor-1',
      conceptKind: 'organization',
      conceptId: 'org-1',
      commissionPayer: 'organization',
      intendedAmount: 50_000,
      amountCharged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collectionId: 'col-1',
      status: 'approved',
      payer: { fullName: 'Donante Real', email: 'donante@test.dev' },
      anonymous: false,
      createdAt: new Date('2026-09-28T00:00:00.000Z'),
      updatedAt: new Date('2026-09-28T00:00:00.000Z'),
      receipt: {
        id: 'rec-1',
        organizationId: 'org-1',
        donationId: 'don-1',
        dedupKey: 'evt-1',
        donor: { fullName: 'Donante Real', email: 'donante@test.dev' },
        intendedAmount: 50_000,
        breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
        issuedAt: new Date('2026-09-28T00:05:00.000Z'),
      },
      ...overrides,
    };
  }

  it('exposes payer and receipt.donor as usual when anonymous is false', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest.fn().mockResolvedValue([donationModel({ anonymous: false })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(false);
    expect(row.payer).toEqual({ fullName: 'Donante Real', email: 'donante@test.dev' });
    expect(row.receipt?.donor).toEqual({ fullName: 'Donante Real', email: 'donante@test.dev' });
    // Everything else is untouched.
    expect(row.breakdown).toEqual({ amountCharged: 50_000, gross: 50_000, net: 48_000 });
  });

  it('masks payer and receipt.donor (never the amount/date/status) when anonymous is true', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest.fn().mockResolvedValue([donationModel({ anonymous: true })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(true);
    expect(row.payer).toBeUndefined();
    expect(row.receipt?.donor).toEqual({});
    // Non-identity fields are NEVER affected by the mask.
    expect(row.amountCharged).toBe(50_000);
    expect(row.status).toBe('approved');
    expect(row.breakdown).toEqual({ amountCharged: 50_000, gross: 50_000, net: 48_000 });
    expect(row.receipt?.intendedAmount).toBe(50_000);
  });

  it('masks correctly even with no receipt yet (pending donation)', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    const findMany = jest
      .fn()
      .mockResolvedValue([donationModel({ anonymous: true, status: 'pending', receipt: null })]);
    h.withOrgContext.mockImplementation(async (_orgId, fn) => fn({ donation: { findMany } }));

    const [row] = await h.service.listReceived();

    expect(row.anonymous).toBe(true);
    expect(row.payer).toBeUndefined();
    expect(row.receipt).toBeUndefined();
  });
});

/**
 * Guest "magic link" comprobante (client requirement, final): a GUEST donor
 * (no account) must be able to check their donation's status/receipt/
 * certificate later without registering. The link is generated INSIDE the
 * webhook, only when the just-approved donation has no `donorUserId` and a
 * `payer.email` to send it to — an authenticated donor already has
 * `/donations/mine` and must never receive one.
 */
describe('DonationsService.applyWebhook — guest access link (magic link)', () => {
  function webhookRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'don-1',
      organization_id: 'org-1',
      donor_user_id: null,
      concept_kind: 'organization',
      concept_id: 'org-1',
      commission_payer: 'organization',
      intended_amount: 50_000,
      amount_charged: 50_000,
      currency: 'COP',
      breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
      collection_id: 'col-1',
      idempotency_key: 'idem-1',
      status: 'approved',
      payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
      anonymous: false,
      created_at: new Date('2026-09-28T00:00:00.000Z'),
      updated_at: new Date('2026-09-28T00:05:00.000Z'),
      ...overrides,
    };
  }

  it('issues an access link and emails it when the approved donation has no donor (guest)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow()]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).toHaveBeenCalledTimes(1);
    const createArgs = h.donationAccessLinkCreate.mock.calls[0][0] as {
      data: { donationId: string; tokenHash: string; expiresAt: Date };
    };
    expect(createArgs.data.donationId).toBe('don-1');
    // The RAW token is never persisted — only its SHA-256 hex hash (64 chars).
    expect(createArgs.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    // 30-day TTL (within a second of tolerance for test execution time).
    const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(createArgs.data.expiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);

    expect(h.send).toHaveBeenCalledTimes(1);
    const message = h.send.mock.calls[0][0] as { to: string; body: string };
    expect(message.to).toBe('guest@test.dev');
    expect(message.body).toContain('https://app.test.local/donaciones/comprobante?token=');
    // The email never logs/exposes the token anywhere else — audited with no token metadata.
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'donation.access_link_issued', metadata: {} }),
    );
  });

  it('does NOT issue an access link for an authenticated donor, but thanks them (link to "Mis donaciones")', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ donor_user_id: 'user-1' })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledTimes(1);
    const message = h.send.mock.calls[0][0] as {
      body: string;
      template: { event: string; data: { enlace: string } };
    };
    expect(message.template.event).toBe('donation.thanks');
    expect(message.template.data.enlace).toBe('https://app.test.local/mis-donaciones');
    expect(message.body).not.toContain('token=');
  });

  it('does NOT issue an access link when the webhook declines the donation', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ status: 'declined', donor_user_id: null })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'declined', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('does NOT issue an access link for a guest with no payer.email', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([webhookRow({ payer: null })]);

    await h.service.applyWebhook(
      { collectionId: 'col-1', status: 'approved', eventId: 'evt-1' },
      'fake-sig',
    );

    expect(h.donationAccessLinkCreate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});

/**
 * PUBLIC guest donation access (`GET /public/donations/access/:token`): the
 * token itself is the credential. Missing/expired/unknown tokens must ALL
 * yield the exact same generic 404 — never distinguishable to a caller
 * probing tokens.
 */
describe('DonationsService.getByAccessToken', () => {
  const donationRow = {
    id: 'don-1',
    organization_id: 'org-1',
    donor_user_id: null,
    concept_kind: 'organization',
    concept_id: 'org-1',
    commission_payer: 'organization',
    intended_amount: 50_000,
    amount_charged: 50_000,
    currency: 'COP',
    breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
    collection_id: 'col-1',
    idempotency_key: 'idem-1',
    status: 'approved',
    payer: { fullName: 'Invitado Test', email: 'guest@test.dev' },
    anonymous: false,
    created_at: new Date('2026-09-28T00:00:00.000Z'),
    updated_at: new Date('2026-09-28T00:05:00.000Z'),
  };

  it('returns the donation (+ receipt/certificate if present) for a valid, unexpired token', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue({
      id: 'link-1',
      donationId: 'don-1',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      createdAt: new Date(),
    });
    // 1st raw call: donation_by_id · 2nd: donation_receipt_by_donation · 3rd: donation_certificate_by_donation.
    h.queryRaw
      .mockResolvedValueOnce([donationRow])
      .mockResolvedValueOnce([
        {
          id: 'rec-1',
          organization_id: 'org-1',
          donation_id: 'don-1',
          dedup_key: 'evt-1',
          donor: { fullName: 'Invitado Test', email: 'guest@test.dev' },
          intended_amount: 50_000,
          breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
          issued_at: new Date('2026-09-28T00:05:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    h.organizationFindMany.mockResolvedValue([{ id: 'org-1', name: 'Refugio Beneficiario' }]);

    const result = await h.service.getByAccessToken('a-valid-raw-token');

    expect(result.donation.id).toBe('don-1');
    expect(result.donation.organizationName).toBe('Refugio Beneficiario');
    expect(result.receipt?.dedupKey).toBe('evt-1');
    expect(result.certificate).toBeUndefined();
  });

  it('rejects an EXPIRED token with a generic NotFoundException', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue({
      id: 'link-1',
      donationId: 'don-1',
      tokenHash: 'irrelevant-in-this-mock',
      expiresAt: new Date(Date.now() - 1000), // already expired
      createdAt: new Date(),
    });

    await expect(h.service.getByAccessToken('an-expired-raw-token')).rejects.toMatchObject({
      status: 404,
    });
    // Never even reaches the donation lookup.
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an UNKNOWN/garbage token with the exact SAME generic 404 (never distinguishable)', async () => {
    const h = makeService();
    h.donationAccessLinkFindUnique.mockResolvedValue(null);

    let expiredError: unknown;
    let unknownError: unknown;
    try {
      const hExpired = makeService();
      hExpired.donationAccessLinkFindUnique.mockResolvedValue({
        id: 'link-1',
        donationId: 'don-1',
        tokenHash: 'x',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });
      await hExpired.service.getByAccessToken('expired');
    } catch (error) {
      expiredError = error;
    }
    try {
      await h.service.getByAccessToken('totally-unknown-garbage');
    } catch (error) {
      unknownError = error;
    }

    expect(expiredError).toBeInstanceOf(Error);
    expect(unknownError).toBeInstanceOf(Error);
    expect((expiredError as { status: number }).status).toBe(
      (unknownError as { status: number }).status,
    );
    expect((expiredError as Error).message).toBe((unknownError as Error).message);
  });
});

describe('DonationsService.getOrganizationAvailability', () => {
  it('fake driver (dev/test): always true, with no account lookup', async () => {
    const h = makeService();
    await expect(h.service.getOrganizationAvailability('org-1')).resolves.toEqual({
      organizationId: 'org-1',
      canReceiveDonations: true,
    });
    expect(h.queryRaw).not.toHaveBeenCalled();
    expect(h.withOrgContext).not.toHaveBeenCalled();
  });

  it('disabled driver: never available (and never looks up a Mercado Pago account)', async () => {
    const h = makeService({ PAYMENT_DRIVER: 'disabled' });
    await expect(h.service.getOrganizationAvailability('org-2')).resolves.toEqual({
      organizationId: 'org-2',
      canReceiveDonations: false,
    });
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});

describe('DonationsService.applyWebhook — PAY-003 (fake driver)', () => {
  const pendingRow = {
    id: 'don-9',
    organization_id: 'org-1',
    donor_user_id: 'user-1',
    concept_kind: 'organization',
    concept_id: 'org-1',
    commission_payer: 'organization',
    intended_amount: 50_000,
    amount_charged: 50_000,
    currency: 'COP',
    breakdown: { amountCharged: 50_000, gross: 50_000, net: 48_000 },
    collection_id: 'af-k',
    idempotency_key: 'k',
    status: 'pending',
    payer: null,
    anonymous: false,
    created_at: new Date('2026-10-08T00:00:00.000Z'),
    updated_at: new Date('2026-10-08T00:00:00.000Z'),
  };

  it('never approves when the charged amount differs, and audits the mismatch', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([pendingRow]); // donation_by_collection_id

    const out = await h.service.applyWebhook(
      { collectionId: 'af-k', status: 'approved', amountCharged: 1_000 },
      'sig',
    );

    expect(out).toEqual({ applied: false, status: null, donationId: null });
    expect(h.queryRaw).toHaveBeenCalledTimes(1); // apply_donation_webhook never ran
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'donation.payment_mismatch',
        metadata: { collectionId: 'af-k', mismatches: ['amount'] },
      }),
    );
  });

  it('ignores a Mercado Pago-style `user_id` in the body (lookup retired): no account query', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]); // apply: unknown collection → no-op

    await h.service.applyWebhook(
      { user_id: '777', collectionId: 'af-k', status: 'approved' },
      'sig',
    );

    expect(h.queryRaw).toHaveBeenCalledTimes(1); // only apply_donation_webhook
    const sql = (h.queryRaw.mock.calls[0][0] as { strings: string[] }).strings.join('?');
    expect(sql).toContain('apply_donation_webhook');
    expect(h.withOrgContext).not.toHaveBeenCalled();
    const context = verifyAndNormalizeWebhookRef.mock.calls[0][2];
    expect(context.collector).toBeUndefined();
    expect(context.epaycoCollector).toBeUndefined();
  });
});

describe('DonationsService — ePayco driver (ADR-PAG-002)', () => {
  const KEY = loadEpaycoKeysEncryptionKey();
  const ORG_KEYS = {
    custId: '123456',
    pKey: 'org-p-key-secret',
    publicKey: 'org-public',
    privateKey: 'org-private-secret',
  };
  const storedRow = {
    custId: ORG_KEYS.custId,
    publicKey: ORG_KEYS.publicKey,
    pKeyEnc: encryptEpaycoSecret(ORG_KEYS.pKey, KEY),
    privateKeyEnc: encryptEpaycoSecret(ORG_KEYS.privateKey, KEY),
  };
  const row = {
    id: 'don-e1',
    organization_id: 'org-1',
    donor_user_id: null,
    concept_kind: 'organization',
    concept_id: 'org-1',
    commission_payer: 'donor',
    intended_amount: 50_000,
    amount_charged: 52_300,
    currency: 'COP',
    breakdown: { amountCharged: 52_300 },
    collection_id: 'af-epayco',
    idempotency_key: 'idem-key-guest-1',
    status: 'pending',
    payer: null,
    anonymous: false,
    created_at: new Date('2026-10-15T00:00:00.000Z'),
    updated_at: new Date('2026-10-15T00:00:00.000Z'),
  };

  function epaycoService(account: unknown = storedRow) {
    const h = makeService({ PAYMENT_DRIVER: 'epayco', EPAYCO_TEST: true });
    const findUnique = jest.fn().mockResolvedValue(account);
    h.withOrgContext.mockImplementation(async (_orgId, fn) =>
      fn({
        organizationEpaycoAccount: { findUnique },
        legalAcceptance: { createMany: jest.fn() },
      }),
    );
    return { h, findUnique };
  }

  it("charges with the org's decrypted ePayco keys and returns the ephemeral checkout session", async () => {
    const { h } = epaycoService();
    const breakdown = computeBreakdown(50_000, 'donor', DIRECT_COLLECTION_RATES);
    h.createCollection.mockResolvedValueOnce({
      collectionId: 'af-epayco',
      status: 'pending',
      breakdown,
      checkoutSessionId: 'sess-9',
    });
    h.queryRaw.mockResolvedValueOnce([]); // idempotency pre-check
    h.queryRaw.mockResolvedValueOnce([row]); // create_donation

    const donation = await h.service.create(undefined, {
      ...BASE_INPUT,
      commissionPayer: 'donor',
      payer: { email: 'guest@test.dev' },
    });

    const input = h.createCollection.mock.calls[0][0];
    expect(input.epaycoCollector).toEqual(ORG_KEYS);
    expect(input.collector).toBeUndefined();
    expect(donation.checkoutSessionId).toBe('sess-9');
    expect(donation.checkoutTest).toBe(true);
    // Persisted breakdown is the one the adapter charged; never a secret in audit.
    const createArgs = h.queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(JSON.parse(createArgs.values[7] as string)).toEqual(breakdown);
    expect(JSON.stringify(h.record.mock.calls)).not.toContain(ORG_KEYS.pKey);
    expect(JSON.stringify(h.record.mock.calls)).not.toContain(ORG_KEYS.privateKey);
  });

  it('409 when the organization has not connected ePayco (no platform fallback)', async () => {
    const { h } = epaycoService(null);
    h.queryRaw.mockResolvedValueOnce([]);
    const error = await h.service
      .create(undefined, { ...BASE_INPUT, payer: { email: 'guest@test.dev' } })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Esta organización todavía no conectó su cuenta para recibir donaciones.',
    );
    expect(h.createCollection).not.toHaveBeenCalled();
  });

  it('availability follows the ePayco account', async () => {
    const { h } = epaycoService({ id: 'acc-1' });
    await expect(h.service.getOrganizationAvailability('org-1')).resolves.toEqual({
      organizationId: 'org-1',
      canReceiveDonations: true,
    });
    expect(h.queryRaw).not.toHaveBeenCalled();
  });

  const confirmation = {
    x_ref_payco: '987654',
    x_id_invoice: 'af-epayco',
    x_cust_id_cliente: '123456',
    collectionId: 'af-epayco',
    status: 'approved',
    amountCharged: 52_300,
  };

  it('webhook: resolves the org from the invoice and verifies with ITS keys', async () => {
    const { h } = epaycoService();
    verifyAndNormalizeWebhookRef.mockImplementationOnce(async () => ({
      eventId: '987654',
      collectionId: 'af-epayco',
      status: 'approved',
      dedupKey: 'epayco:987654:approved',
      amountCharged: 52_300,
      currency: 'COP',
      receiverAccountId: '123456',
    }));
    h.queryRaw.mockResolvedValueOnce([row]); // invoice → donation → org
    h.queryRaw.mockResolvedValueOnce([row]); // matchesExpectedPayment
    h.queryRaw.mockResolvedValueOnce([{ ...row, status: 'approved' }]); // apply

    const out = await h.service.applyWebhook(confirmation, '');
    expect(out.applied).toBe(true);
    const context = verifyAndNormalizeWebhookRef.mock.calls[0][2];
    expect(context.epaycoCollector).toEqual(ORG_KEYS);
    expect(context.collector).toBeUndefined();
  });

  it('webhook: falls back to the merchant id only when the invoice is unknown', async () => {
    const { h } = epaycoService();
    h.queryRaw.mockResolvedValueOnce([]); // unknown invoice
    h.queryRaw.mockResolvedValueOnce([{ organization_id: 'org-1' }]); // cust id → org
    h.queryRaw.mockResolvedValueOnce([]); // matchesExpectedPayment: unknown → true
    h.queryRaw.mockResolvedValueOnce([]); // apply: no-op

    await h.service.applyWebhook({ ...confirmation, x_id_invoice: 'af-unknown' }, '');
    const sql = (h.queryRaw.mock.calls[1][0] as { strings: string[] }).strings.join('?');
    expect(sql).toContain('epayco_account_organization_id');
    expect(verifyAndNormalizeWebhookRef.mock.calls[0][2].epaycoCollector).toEqual(ORG_KEYS);
  });

  it('webhook: an amount or receiver mismatch is audited and never approves', async () => {
    const { h } = epaycoService();
    verifyAndNormalizeWebhookRef.mockImplementationOnce(async () => ({
      eventId: '987654',
      collectionId: 'af-epayco',
      status: 'approved',
      dedupKey: 'epayco:987654:approved',
      amountCharged: Number.NaN,
      currency: 'COP',
      receiverAccountId: '555',
    }));
    h.queryRaw.mockResolvedValueOnce([row]);
    h.queryRaw.mockResolvedValueOnce([row]);

    const out = await h.service.applyWebhook(confirmation, '');
    expect(out).toEqual({ applied: false, status: null, donationId: null });
    expect(h.queryRaw).toHaveBeenCalledTimes(2);
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'donation.payment_mismatch',
        metadata: { collectionId: 'af-epayco', mismatches: ['receiver', 'amount'] },
      }),
    );
  });

  it('webhook: a verification failure is a 403, never a settlement', async () => {
    const { h } = epaycoService();
    verifyAndNormalizeWebhookRef.mockRejectedValueOnce(new Error('signature mismatch'));
    h.queryRaw.mockResolvedValueOnce([row]);
    await expect(h.service.applyWebhook(confirmation, '')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.queryRaw).toHaveBeenCalledTimes(1);
  });
});

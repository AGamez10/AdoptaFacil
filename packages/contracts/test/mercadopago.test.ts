import { describe, expect, it } from 'vitest';
import {
  isMercadoPagoCheckoutUrl,
  mercadoPagoPaymentStatus,
  mercadoPagoPreapprovalStatus,
  parsePlanSubscriptionReference,
  planSubscriptionReference,
} from '../src/mercadopago';
import { planCollection } from '../src/payment-gateways';

const ORG = '0f0e0d0c-0b0a-4908-8706-050403020100';

describe('Mercado Pago contract (ADR-PAG-003)', () => {
  it('only approved settles; refunds and chargebacks are voided; unknown stays pending', () => {
    expect(mercadoPagoPaymentStatus('approved')).toBe('approved');
    expect(mercadoPagoPaymentStatus('rejected')).toBe('declined');
    for (const s of ['refunded', 'charged_back', 'cancelled']) {
      expect(mercadoPagoPaymentStatus(s)).toBe('voided');
    }
    for (const s of ['pending', 'in_process', 'in_mediation', 'whatever', undefined]) {
      expect(mercadoPagoPaymentStatus(s)).toBe('pending');
    }
  });

  it('accepts only https Mercado Pago checkout hosts (no open redirect)', () => {
    expect(
      isMercadoPagoCheckoutUrl('https://www.mercadopago.com.co/checkout/v1/redirect?x=1'),
    ).toBe(true);
    expect(isMercadoPagoCheckoutUrl('https://sandbox.mercadopago.com.co/checkout')).toBe(true);
    expect(isMercadoPagoCheckoutUrl('http://www.mercadopago.com.co/checkout')).toBe(false);
    expect(isMercadoPagoCheckoutUrl('https://www.mercadopago.com.co.evil.test/x')).toBe(false);
    expect(isMercadoPagoCheckoutUrl('https://user@www.mercadopago.com.co/x')).toBe(false);
    expect(isMercadoPagoCheckoutUrl('https://www.mercadopago.com.co:8443/x')).toBe(false);
    expect(isMercadoPagoCheckoutUrl(undefined)).toBe(false);
  });

  it('round-trips the plan reference and refuses anything else', () => {
    const ref = planSubscriptionReference(ORG, 'crece');
    expect(parsePlanSubscriptionReference(ref)).toEqual({ organizationId: ORG, plan: 'crece' });
    expect(parsePlanSubscriptionReference(`afplan:${ORG}:free`)).toBeNull();
    expect(parsePlanSubscriptionReference(`af-${ORG}`)).toBeNull();
    expect(parsePlanSubscriptionReference(null)).toBeNull();
  });

  it('only an authorized preapproval activates a plan', () => {
    expect(mercadoPagoPreapprovalStatus('authorized')).toBe('active');
    expect(mercadoPagoPreapprovalStatus('paused')).toBe('past_due');
    expect(mercadoPagoPreapprovalStatus('cancelled')).toBe('canceled');
    expect(mercadoPagoPreapprovalStatus('pending')).toBeNull();
  });

  it('direct collection is allowed with fee 0; the split is not available in Colombia', () => {
    const conn = {
      organizationId: ORG,
      provider: 'mercadopago' as const,
      status: 'active' as const,
      gatewayAccountId: '123',
    };
    const direct = planCollection(
      ORG,
      { ...conn, mode: 'direct_to_org' },
      { enabledModes: ['direct_to_org'], splitPlatformFeeRate: 0, splitApprovalRef: null },
    );
    expect(direct).toMatchObject({
      ok: true,
      plan: { collector: 'organization', platformFeeRate: 0 },
    });
    const split = planCollection(
      ORG,
      { ...conn, mode: 'platform_split' },
      { enabledModes: ['platform_split'], splitPlatformFeeRate: 0.04, splitApprovalRef: 'X' },
    );
    expect(split.ok).toBe(false);
  });
});

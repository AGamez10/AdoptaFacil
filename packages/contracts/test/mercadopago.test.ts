import { describe, expect, it } from 'vitest';
import {
  isMercadoPagoCheckoutUrl,
  mercadoPagoSettledBreakdown,
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

  it('direct collection to the org is the only plan (no split, no platform fee)', () => {
    const direct = planCollection(
      ORG,
      {
        organizationId: ORG,
        provider: 'mercadopago',
        mode: 'direct_to_org',
        status: 'active',
        gatewayAccountId: '123',
      },
      { enabledModes: ['direct_to_org'] },
    );
    expect(direct).toEqual({
      ok: true,
      plan: {
        provider: 'mercadopago',
        mode: 'direct_to_org',
        collector: 'organization',
        verifiable: true,
      },
    });
  });

  it('the settled breakdown is the real net Mercado Pago reports, never an estimate', () => {
    expect(mercadoPagoSettledBreakdown(50000, { netReceivedAmount: '47589.6' })).toEqual({
      amountCharged: 50000,
      gross: 50000,
      platformFee: 0,
      platformIva: 0,
      gatewayFee: 2410,
      gatewayIva: 0,
      net: 47590,
    });
    for (const netReceivedAmount of [null, '', 'abc', '0', '60000']) {
      expect(mercadoPagoSettledBreakdown(50000, { netReceivedAmount })).toBeNull();
    }
    expect(mercadoPagoSettledBreakdown(50000, undefined)).toBeNull();
  });
});

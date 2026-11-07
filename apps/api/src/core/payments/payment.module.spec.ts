import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FakePaymentAdapter, type PaymentPort } from '@adoptafacil/contracts';
import { PAYMENT_PORT } from './payment.port';
import { PaymentModule } from './payment.module';
import { DisabledPaymentAdapter } from './disabled-payment.adapter';
import { MercadoPagoPaymentAdapter } from './mercadopago-payment.adapter';

describe('PaymentModule (T-052)', () => {
  async function resolvePort(): Promise<PaymentPort> {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PaymentModule],
    }).compile();
    return moduleRef.get<PaymentPort>(PAYMENT_PORT);
  }

  /** Isolated env (ignores the real .env) so the driver tests are deterministic. */
  async function resolvePortWithEnv(env: Record<string, string>): Promise<PaymentPort> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
        PaymentModule,
      ],
    }).compile();
    return moduleRef.get<PaymentPort>(PAYMENT_PORT);
  }

  it('binds PAYMENT_PORT to the FakePaymentAdapter imported from contracts', async () => {
    const port = await resolvePort();
    expect(port).toBeInstanceOf(FakePaymentAdapter);
  });

  it('resolves a functional, DETERMINISTIC port (same idempotencyKey → same ids/breakdown)', async () => {
    const port = await resolvePort();
    const input = {
      intendedAmount: 100_000,
      currency: 'COP' as const,
      concept: { kind: 'organization' as const, id: 'org-1' },
      idempotencyKey: 'key-abc',
    };

    const a = await port.createCollection(input);
    const b = await port.createCollection(input);
    expect(a.collectionId).toBe(b.collectionId);
    expect(a.status).toBe('approved');
    expect(a.breakdown).toEqual(b.breakdown);
  });

  it('binds PAYMENT_PORT to the MercadoPagoPaymentAdapter when PAYMENT_DRIVER=mercadopago', async () => {
    const port = await resolvePortWithEnv({ PAYMENT_DRIVER: 'mercadopago' });
    expect(port).toBeInstanceOf(MercadoPagoPaymentAdapter);
  });
  it('binds the DisabledPaymentAdapter when PAYMENT_DRIVER=disabled', async () => {
    const port = await resolvePortWithEnv({ PAYMENT_DRIVER: 'disabled' });
    expect(port).toBeInstanceOf(DisabledPaymentAdapter);
  });
});

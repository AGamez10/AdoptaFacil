import { ServiceUnavailableException } from '@nestjs/common';
import { DisabledPaymentAdapter } from './disabled-payment.adapter';

describe('DisabledPaymentAdapter (R0-1, SEC-002)', () => {
  const adapter = new DisabledPaymentAdapter();

  it('never trusts a webhook, signed or not', async () => {
    const forged = { collectionId: 'fake-col-x', status: 'approved', eventId: 'forged' };
    await expect(adapter.verifyAndNormalizeWebhook(forged, '')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      adapter.verifyAndNormalizePayoutWebhook({ payoutId: 'p', status: 'paid' }, 'sig'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never creates or reports a collection or payout', async () => {
    await expect(
      adapter.createCollection({
        intendedAmount: 10_000,
        currency: 'COP',
        concept: { kind: 'organization', id: 'org-1' },
        commissionPayer: 'organization',
        idempotencyKey: 'k',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(adapter.getCollectionStatus('col')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import { DisabledPaymentAdapter } from './disabled-payment.adapter';

describe('DisabledPaymentAdapter (R0-1, SEC-002)', () => {
  const adapter = new DisabledPaymentAdapter();

  it('never trusts a webhook, signed or not', async () => {
    const forged = { collectionId: 'fake-col-x', status: 'approved', eventId: 'forged' };
    await expect(adapter.verifyAndNormalizeWebhook(forged, '')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('never creates or reports a collection', async () => {
    await expect(
      adapter.createCollection({
        intendedAmount: 10_000,
        currency: 'COP',
        concept: { kind: 'organization', id: 'org-1' },
        idempotencyKey: 'k',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(adapter.getCollectionStatus('col')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

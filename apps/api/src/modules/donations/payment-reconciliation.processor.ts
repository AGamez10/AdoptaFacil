import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  PAYMENT_RECONCILE_DAILY_JOB,
  PAYMENT_RECONCILE_QUEUE,
} from './payment-reconciliation.constants';
import { PaymentReconciliationService } from './payment-reconciliation.service';

/** Worker of the `payment-reconcile` queue (B3). */
@Processor(PAYMENT_RECONCILE_QUEUE)
export class PaymentReconciliationProcessor extends WorkerHost {
  constructor(private readonly service: PaymentReconciliationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.service.run(job.name === PAYMENT_RECONCILE_DAILY_JOB ? 'daily' : 'pending');
  }
}

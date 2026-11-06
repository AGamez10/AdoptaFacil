import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { MERCADOPAGO_TOKEN_REFRESH_QUEUE } from './mercadopago-connect.constants';
import { MercadoPagoConnectionsService } from './mercadopago-connections.service';

/** Worker of the `mercadopago-token-refresh` queue (ADR-PAG-003). */
@Processor(MERCADOPAGO_TOKEN_REFRESH_QUEUE)
export class MercadoPagoTokenRefreshProcessor extends WorkerHost {
  constructor(private readonly service: MercadoPagoConnectionsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.service.refreshDueConnections();
  }
}

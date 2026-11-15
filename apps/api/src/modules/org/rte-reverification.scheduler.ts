import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import { RteReverificationService } from './rte-reverification.service';

export const RTE_REVERIFICATION_QUEUE = 'rte-reverification';
export const RTE_REVERIFICATION_JOB = 'scan';
const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Registra el escaneo diario de la reverificación del RTE. Se omite con
 * NODE_ENV=test (las pruebas llaman al servicio directo); un Redis caído
 * nunca bloquea el arranque. BullMQ deduplica la entrada repetible.
 */
@Injectable()
export class RteReverificationScheduler implements OnModuleInit {
  private readonly logger = new Logger(RteReverificationScheduler.name);

  constructor(
    @InjectQueue(RTE_REVERIFICATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      await this.queue.add(
        RTE_REVERIFICATION_JOB,
        {},
        { repeat: { every: DAILY_MS }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log('rte-reverification scan scheduled daily');
    } catch (error) {
      this.logger.warn(`Could not schedule rte-reverification scan: ${(error as Error).message}`);
    }
  }
}

/** Worker de la cola `rte-reverification`. */
@Processor(RTE_REVERIFICATION_QUEUE)
export class RteReverificationProcessor extends WorkerHost {
  constructor(private readonly rte: RteReverificationService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.rte.scan();
  }
}

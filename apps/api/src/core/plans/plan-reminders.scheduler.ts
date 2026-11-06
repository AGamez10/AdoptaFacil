import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import { PlanRemindersService } from './plan-reminders.service';

export const PLAN_REMINDERS_QUEUE = 'plan-reminders';
export const PLAN_REMINDERS_JOB = 'scan';
const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Registers the daily plan-reminder scan (renovación, cobro fallido, fin de un
 * plan cancelado). Only with `PLAN_ENFORCEMENT` on; skipped under
 * NODE_ENV=test (the integration tests call the service directly); a missing
 * Redis never blocks boot. BullMQ dedups the repeatable entry.
 */
@Injectable()
export class PlanRemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(PlanRemindersScheduler.name);

  constructor(
    @InjectQueue(PLAN_REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.config.get('PLAN_ENFORCEMENT', { infer: true }) !== true) return;
    try {
      await this.queue.add(
        PLAN_REMINDERS_JOB,
        {},
        { repeat: { every: DAILY_MS }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log('plan-reminders scan scheduled daily');
    } catch (error) {
      this.logger.warn(`Could not schedule plan-reminders scan: ${(error as Error).message}`);
    }
  }
}

/** Worker of the `plan-reminders` queue. */
@Processor(PLAN_REMINDERS_QUEUE)
export class PlanRemindersProcessor extends WorkerHost {
  constructor(private readonly reminders: PlanRemindersService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.reminders.sendDueReminders();
  }
}

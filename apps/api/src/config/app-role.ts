import { Worker } from 'bullmq';
// Not re-exported from the package index; `workerClass` is its public setter.
import { BullExplorer } from '@nestjs/bullmq/dist/bull.explorer';

/**
 * Plan de escala (B7): which part of the work this process does.
 *
 * - `all` (default, local dev and tests): HTTP + queue workers, as before.
 * - `api`: serves HTTP only; queue workers are created idle (never pull jobs),
 *   so a batch of e-mails or reminders never competes with requests.
 * - `worker`: runs the queue workers. It still answers /health so the
 *   orchestrator can check it, but the edge never routes traffic to it.
 *
 * Producers (enqueueing jobs, repeatable-job schedules) run in every role:
 * they only write to Redis and are idempotent.
 */
export type AppRole = 'all' | 'api' | 'worker';

export function appRole(env: NodeJS.ProcessEnv = process.env): AppRole {
  const value = env.APP_ROLE;
  return value === 'api' || value === 'worker' ? value : 'all';
}

export function runsQueueWorkers(role: AppRole = appRole()): boolean {
  return role !== 'api';
}

/**
 * BullMQ worker that never starts pulling jobs (`autorun: false`). Registered
 * as the `@nestjs/bullmq` worker class in the `api` role, so every
 * `@Processor` stays wired (same module graph) but idle.
 */
export class IdleWorker<T = unknown, R = unknown, N extends string = string> extends Worker<
  T,
  R,
  N
> {
  constructor(...args: ConstructorParameters<typeof Worker<T, R, N>>) {
    const [name, processor, opts] = args;
    super(name, processor, { ...opts, connection: opts!.connection, autorun: false });
  }
}

/** Make every `@Processor` worker idle when this process does not run queues.
 *  Must run BEFORE the Nest application is created. */
export function configureQueueRole(role: AppRole = appRole()): void {
  BullExplorer.workerClass = runsQueueWorkers(role) ? Worker : IdleWorker;
}

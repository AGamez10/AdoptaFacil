import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { parseRedisUrl } from '../src/config/env.validation';

/**
 * Ola 1 · R1-7 (BLD-003): BullMQ must connect with the WHOLE REDIS_URL. Before,
 * only host and port survived, so two environments pointed at different
 * database indexes (`/1`, `/2`) shared one queue and consumed each other's
 * jobs — reproduced during the audit with the DIAN and payout queues.
 */
describe('BullMQ connection keeps the REDIS_URL database (R1-7)', () => {
  const base = new URL(process.env.REDIS_URL as string);
  const urlFor = (db: number) => {
    const url = new URL(base.toString());
    url.pathname = `/${db}`;
    return url.toString();
  };
  const name = `r17-isolation-${randomUUID()}`;
  const queues: Queue[] = [];

  afterAll(async () => {
    for (const queue of queues) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  it("two environments on /1 and /2 do not see each other's jobs", async () => {
    const envOne = new Queue(name, { connection: parseRedisUrl(urlFor(1)) });
    const envTwo = new Queue(name, { connection: parseRedisUrl(urlFor(2)) });
    queues.push(envOne, envTwo);

    await envOne.add('job', { from: 'env-1' });

    expect(await envOne.getWaitingCount()).toBe(1);
    expect(await envTwo.getWaitingCount()).toBe(0);
  });
});

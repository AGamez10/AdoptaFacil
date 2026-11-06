import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureQueueRole } from '../src/config/app-role';
import { RemindersProcessor } from '../src/modules/animals/reminders.processor';

/**
 * Plan de escala (B7): an `api` process keeps every queue processor wired but
 * idle, so HTTP never competes with queue work; `all` keeps today's behavior.
 */
describe('APP_ROLE queue split (plan de escala, B7)', () => {
  async function boot(role: 'api' | 'all'): Promise<INestApplication> {
    configureQueueRole(role);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  afterAll(() => configureQueueRole('all'));

  it('api role: processors exist but their workers never pull jobs', async () => {
    const app = await boot('api');
    try {
      expect(app.get(RemindersProcessor).worker.isRunning()).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('all role (default): processors run as before', async () => {
    const app = await boot('all');
    try {
      expect(app.get(RemindersProcessor).worker.isRunning()).toBe(true);
    } finally {
      await app.close();
    }
  });
});

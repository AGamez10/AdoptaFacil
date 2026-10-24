import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';
import { runLocalPreflight } from './config/local-preflight';
import { applyHttpHardening } from './core/http/configure-http';

async function bootstrap(): Promise<void> {
  // Local dev only: a stopped Postgres/Redis container gets one clear message
  // and exit, instead of an endless connection-error loop before listen().
  await runLocalPreflight();
  // Env validation runs while the module graph is built: with NODE_ENV=production
  // it refuses simulated adapters and unsafe settings (Ola 1, R0-1), so the
  // process exits before listening.
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  applyHttpHardening(app, {
    production: config.get('NODE_ENV', { infer: true }) === 'production',
    trustProxyHops: config.get('TRUST_PROXY_HOPS', { infer: true }) ?? 0,
  });

  const origins = config
    .get('API_CORS_ORIGIN', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Render (and most PaaS) inject PORT and require the app to bind to it;
  // API_PORT stays the source of truth for local dev (docker-compose has no PORT).
  const port = process.env.PORT
    ? Number(process.env.PORT)
    : config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`AdoptaFácil API listening on http://0.0.0.0:${port}`);
}

void bootstrap();

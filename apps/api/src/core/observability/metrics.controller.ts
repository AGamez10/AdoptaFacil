import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../../config/env.validation';
import { metricsRegistry } from './metrics';

/**
 * Plan de escala (B9): Prometheus scrape endpoint. Off (404) unless
 * METRICS_TOKEN is set, and then only with `Authorization: Bearer <token>`,
 * so it never becomes a public page even though it sits behind Caddy's /api.
 */
@Controller('metrics')
export class MetricsController {
  private readonly token: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.token = config.get('METRICS_TOKEN', { infer: true });
  }

  @Get()
  async scrape(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.token || !this.authorized(authorization)) {
      throw new NotFoundException();
    }
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(await metricsRegistry.metrics());
  }

  private authorized(header: string | undefined): boolean {
    const given = Buffer.from(header ?? '');
    const expected = Buffer.from(`Bearer ${this.token}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}

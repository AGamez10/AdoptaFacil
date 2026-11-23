import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AlertingExceptionFilter } from './alerting-exception.filter';
import { AlertsService } from './alerts.service';
import { MetricsController } from './metrics.controller';

/**
 * `/metrics` and error alerts. `AlertsService` is global so jobs (payment
 * reconciliation…) can raise an alert; the filter alerts on every 5xx.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [AlertsService, { provide: APP_FILTER, useClass: AlertingExceptionFilter }],
  exports: [AlertsService],
})
export class ObservabilityModule {}

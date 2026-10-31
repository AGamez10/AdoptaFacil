import { Module } from '@nestjs/common';
import { CspReportController } from './csp-report.controller';

/** Endpoint for Content-Security-Policy violation reports (deploy/Caddyfile). */
@Module({ controllers: [CspReportController] })
export class CspReportModule {}

import { Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { parseCspReports } from './csp-report';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Receives the browser's CSP violation reports (`report-uri` in
 * deploy/Caddyfile). Anonymous by nature, so it lives under /public and shares
 * the public rate limit (core/bots). Bodies over 8 KB are dropped unread; the
 * answer is always 204 so the endpoint tells a caller nothing.
 */
@Controller('public/security')
export class CspReportController {
  private readonly logger = new Logger('CspReport');

  @Post('csp-report')
  @HttpCode(204)
  async report(@Req() req: Request): Promise<void> {
    const payload = await readJsonBody(req);
    for (const violation of parseCspReports(payload)) {
      this.logger.warn(`csp-violation ${JSON.stringify(violation)}`);
    }
  }
}

/**
 * `application/json` arrives already parsed by Nest; the report content types
 * (`application/csp-report`, `application/reports+json`) do not, so the raw
 * stream is read here with a hard size cap.
 */
async function readJsonBody(req: Request): Promise<unknown> {
  if (req.readableEnded) return req.body;
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY_BYTES) {
    req.resume();
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { BotVerifier, type VerifiedBot } from './verified-bots';

const WINDOW_MS = 60_000;

/** Requests per minute: per client IP, and per verified crawler operator. */
export interface PublicRateLimits {
  ip: number;
  bot: number;
}
export const PUBLIC_RATE_LIMITS = Symbol('PUBLIC_RATE_LIMITS');

type PublicRequest = Request & { verifiedBot?: VerifiedBot | null };

/**
 * Rate limit for every anonymous `/public/*` route (plan SEO · P0).
 *
 * Before this guard the public catalog, campaigns, certificates, reports and
 * org profiles had no limit at all: only auth, MFA, invitations and exports
 * used `@Throttle`. This guard is global but acts ONLY on `/public/*`, so those
 * existing per-route limits are untouched.
 *
 * - One shared budget per client across all public routes (a scraper cannot
 *   multiply it by spreading over endpoints): PUBLIC_RATE_LIMIT_PER_MINUTE per
 *   IP. The default (300) leaves room for many people behind one carrier NAT,
 *   common on Colombian mobile networks, and still stops bulk scraping.
 * - A search-engine crawler PROVEN by reverse + forward DNS (BotVerifier) gets
 *   one budget per operator instead (PUBLIC_RATE_LIMIT_BOT_PER_MINUTE, all of
 *   Google's IPs together). Claiming to be Googlebot in the User-Agent alone
 *   changes nothing.
 * - Over the limit: 429 with Retry-After, which crawlers honor by slowing
 *   down; never 403.
 *
 * `req.ip` is the real client IP only with TRUST_PROXY_HOPS set correctly
 * (production requires it, see env.validation.ts).
 */
@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly botVerifier: BotVerifier,
    @Inject(PUBLIC_RATE_LIMITS) private readonly limits: PublicRateLimits,
  ) {
    super(options, storageService, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    return !isPublicPath(req.path ?? req.url);
  }

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const req = requestProps.context.switchToHttp().getRequest<PublicRequest>();
    req.verifiedBot = await this.botVerifier.verify(req.ip, req.get('user-agent'));
    return super.handleRequest({
      ...requestProps,
      limit: req.verifiedBot ? this.limits.bot : this.limits.ip,
      ttl: WINDOW_MS,
      blockDuration: WINDOW_MS,
    });
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const { verifiedBot, ip } = req as unknown as PublicRequest;
    return verifiedBot ? `bot:${verifiedBot}` : `ip:${ip ?? 'unknown'}`;
  }

  /** One key per client for ALL public routes (the default key is per handler). */
  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    name: string,
  ): string {
    return `public-api:${name}:${tracker}`;
  }
}

export function isPublicPath(path: string): boolean {
  return path === '/public' || path.startsWith('/public/');
}

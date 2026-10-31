import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

/** Search-engine operator whose crawler IP was proven, never just claimed. */
export type VerifiedBot = 'google' | 'bing' | 'apple';

interface DnsRule {
  bot: VerifiedBot;
  /** Only picks WHICH rule to try; the decision is the IP's (see verify). */
  userAgent: RegExp;
  /** Reverse-DNS host suffixes the operator documents for its crawlers. */
  hostSuffixes: readonly string[];
}

/**
 * Crawlers verifiable by reverse DNS + forward confirmation, as each operator
 * documents it (Google Search Central, Bing Webmaster, Applebot docs).
 * AI crawlers that publish IP-range lists instead (OpenAI, Perplexity) are not
 * verified here yet: they get the normal per-IP budget, which is far above
 * what a polite crawler needs — and they mostly read the prerendered HTML,
 * not this API.
 */
export const DNS_VERIFIED_BOTS: readonly DnsRule[] = [
  {
    bot: 'google',
    userAgent: /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google/i,
    hostSuffixes: ['googlebot.com', 'google.com', 'googleusercontent.com'],
  },
  { bot: 'bing', userAgent: /bingbot|BingPreview|msnbot/i, hostSuffixes: ['search.msn.com'] },
  { bot: 'apple', userAgent: /Applebot/i, hostSuffixes: ['applebot.apple.com'] },
];

/** DNS calls the verifier makes; swapped in unit tests (no network). */
export interface BotDnsResolver {
  reverse(ip: string): Promise<string[]>;
  resolve(host: string, family: 4 | 6): Promise<string[]>;
}

const systemResolver: BotDnsResolver = {
  reverse: (ip) => dns.reverse(ip),
  resolve: (host, family) => (family === 6 ? dns.resolve6(host) : dns.resolve4(host)),
};

const DNS_TIMEOUT_MS = 1_500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 10_000;

/**
 * Decides whether a request really comes from a search-engine crawler.
 *
 * A User-Agent is one header anyone can send, so it only selects the rule; the
 * IP must then reverse-resolve to the operator's domain AND that host must
 * resolve back to the same IP (a PTR record alone is controlled by whoever owns
 * the IP). Any DNS failure or timeout means "not verified" — the request is
 * still served, just under the normal per-IP limit.
 *
 * Results (positive and negative) are cached per IP for 24 h in a bounded
 * in-process map, so DNS runs at most once a day per crawler IP and a flood of
 * fake "Googlebot" requests cannot turn the API into a DNS amplifier.
 */
@Injectable()
export class BotVerifier {
  private readonly logger = new Logger(BotVerifier.name);
  private readonly cache = new Map<string, { bot: VerifiedBot | null; expiresAt: number }>();

  constructor(
    private readonly resolver: BotDnsResolver = systemResolver,
    private readonly now: () => number = Date.now,
  ) {}

  async verify(ip: string | undefined, userAgent: string | undefined): Promise<VerifiedBot | null> {
    if (!ip || !userAgent) return null;
    const family = isIP(ip);
    if (family === 0) return null;
    const rule = DNS_VERIFIED_BOTS.find((candidate) => candidate.userAgent.test(userAgent));
    if (!rule) return null;

    const cacheKey = `${rule.bot}:${ip}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.bot;

    const bot = (await this.confirm(ip, family as 4 | 6, rule)) ? rule.bot : null;
    if (!bot) {
      this.logger.warn(`Unverified ${rule.bot} User-Agent from a non-${rule.bot} IP`);
    }
    this.remember(cacheKey, bot);
    return bot;
  }

  private async confirm(ip: string, family: 4 | 6, rule: DnsRule): Promise<boolean> {
    try {
      const hosts = await withTimeout(this.resolver.reverse(ip), DNS_TIMEOUT_MS);
      for (const raw of hosts) {
        const host = raw.toLowerCase().replace(/\.$/, '');
        const matches = rule.hostSuffixes.some(
          (suffix) => host === suffix || host.endsWith(`.${suffix}`),
        );
        if (!matches) continue;
        const forward = await withTimeout(this.resolver.resolve(host, family), DNS_TIMEOUT_MS);
        if (forward.includes(ip)) return true;
      }
    } catch {
      // NXDOMAIN, timeout, resolver down: not verified (never an error for the client).
    }
    return false;
  }

  private remember(key: string, bot: VerifiedBot | null): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Map keeps insertion order: drop the oldest entry.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { bot, expiresAt: this.now() + CACHE_TTL_MS });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('dns timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

import { BotVerifier, type BotDnsResolver } from './verified-bots';

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** In-memory DNS: PTR records by IP and A/AAAA records by host. */
function fakeDns(ptr: Record<string, string[]>, forward: Record<string, string[]>) {
  const calls = { reverse: 0, resolve: 0 };
  const resolver: BotDnsResolver = {
    reverse: async (ip) => {
      calls.reverse += 1;
      if (!ptr[ip]) throw new Error('ENOTFOUND');
      return ptr[ip];
    },
    resolve: async (host) => {
      calls.resolve += 1;
      return forward[host] ?? [];
    },
  };
  return { resolver, calls };
}

describe('BotVerifier (reverse + forward DNS)', () => {
  it('verifies Googlebot when the PTR is Google AND resolves back to the same IP', async () => {
    const { resolver } = fakeDns(
      { '66.249.66.1': ['crawl-66-249-66-1.googlebot.com.'] },
      { 'crawl-66-249-66-1.googlebot.com': ['66.249.66.1'] },
    );
    await expect(new BotVerifier(resolver).verify('66.249.66.1', GOOGLEBOT_UA)).resolves.toBe(
      'google',
    );
  });

  it('rejects a Googlebot User-Agent from an IP whose PTR is not Google', async () => {
    const { resolver } = fakeDns({ '203.0.113.7': ['scraper.example.net'] }, {});
    await expect(new BotVerifier(resolver).verify('203.0.113.7', GOOGLEBOT_UA)).resolves.toBeNull();
  });

  it('rejects a forged PTR that does not resolve back to the IP', async () => {
    const { resolver } = fakeDns(
      { '203.0.113.8': ['crawl.googlebot.com'] },
      { 'crawl.googlebot.com': ['66.249.66.9'] },
    );
    await expect(new BotVerifier(resolver).verify('203.0.113.8', GOOGLEBOT_UA)).resolves.toBeNull();
  });

  it('rejects look-alike domains (suffix must match on a label boundary)', async () => {
    const { resolver } = fakeDns(
      { '203.0.113.9': ['evilgooglebot.com'] },
      { 'evilgooglebot.com': ['203.0.113.9'] },
    );
    await expect(new BotVerifier(resolver).verify('203.0.113.9', GOOGLEBOT_UA)).resolves.toBeNull();
  });

  it('never runs DNS for ordinary browsers or invalid IPs', async () => {
    const { resolver, calls } = fakeDns({}, {});
    const verifier = new BotVerifier(resolver);
    await expect(verifier.verify('198.51.100.1', 'Mozilla/5.0 Firefox/130')).resolves.toBeNull();
    await expect(verifier.verify('not-an-ip', GOOGLEBOT_UA)).resolves.toBeNull();
    await expect(verifier.verify(undefined, GOOGLEBOT_UA)).resolves.toBeNull();
    expect(calls.reverse).toBe(0);
  });

  it('treats a DNS failure as "not verified" (the request is still served)', async () => {
    const resolver: BotDnsResolver = {
      reverse: () => Promise.reject(new Error('SERVFAIL')),
      resolve: () => Promise.resolve([]),
    };
    await expect(new BotVerifier(resolver).verify('66.249.66.2', GOOGLEBOT_UA)).resolves.toBeNull();
  });

  it('caches the answer per IP for 24 h, so fake bots cannot drive DNS traffic', async () => {
    let now = 0;
    const { resolver, calls } = fakeDns({ '203.0.113.10': ['x.example.net'] }, {});
    const verifier = new BotVerifier(resolver, () => now);
    for (let i = 0; i < 50; i += 1) await verifier.verify('203.0.113.10', GOOGLEBOT_UA);
    expect(calls.reverse).toBe(1);
    now += 24 * 60 * 60 * 1000 + 1;
    await verifier.verify('203.0.113.10', GOOGLEBOT_UA);
    expect(calls.reverse).toBe(2);
  });

  it('verifies Bingbot and Applebot against their own domains only', async () => {
    const { resolver } = fakeDns(
      {
        '157.55.39.1': ['msnbot-157-55-39-1.search.msn.com'],
        '17.58.1.1': ['17-58-1-1.applebot.apple.com'],
      },
      {
        'msnbot-157-55-39-1.search.msn.com': ['157.55.39.1'],
        '17-58-1-1.applebot.apple.com': ['17.58.1.1'],
      },
    );
    const verifier = new BotVerifier(resolver);
    await expect(
      verifier.verify('157.55.39.1', 'Mozilla/5.0 (compatible; bingbot/2.0)'),
    ).resolves.toBe('bing');
    await expect(verifier.verify('17.58.1.1', 'Mozilla/5.0 (Applebot/0.1)')).resolves.toBe('apple');
    // A Bing PTR does not verify a Googlebot claim.
    await expect(verifier.verify('157.55.39.1', GOOGLEBOT_UA)).resolves.toBeNull();
  });
});

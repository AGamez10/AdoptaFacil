import { parseCspReports } from './csp-report';

describe('parseCspReports', () => {
  it('reads the legacy report-uri shape and keeps only origin and path', () => {
    const [violation] = parseCspReports({
      'csp-report': {
        'document-uri': 'https://adoptafacil.example/donaciones/comprobante?token=secret-token',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://cdn.evil.example/x.js?user=ana@example.com',
        disposition: 'report',
      },
    });
    expect(violation).toEqual({
      directive: 'script-src-elem',
      blocked: 'https://cdn.evil.example',
      page: '/donaciones/comprobante',
      disposition: 'report',
    });
    expect(JSON.stringify(violation)).not.toMatch(/secret-token|ana@example\.com/);
  });

  it('reads the Reporting API shape and ignores other report types', () => {
    const violations = parseCspReports([
      { type: 'deprecation', body: { id: 'x' } },
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://adoptafacil.example/adoptar',
          effectiveDirective: 'style-src-attr',
          blockedURL: 'inline',
          disposition: 'enforce',
        },
      },
    ]);
    expect(violations).toEqual([
      { directive: 'style-src-attr', blocked: 'inline', page: '/adoptar', disposition: 'enforce' },
    ]);
  });

  it('returns nothing for junk and caps the number of reports per request', () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports('csp')).toEqual([]);
    expect(parseCspReports({ other: 1 })).toEqual([]);
    const many = Array.from({ length: 100 }, () => ({
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src' },
    }));
    expect(parseCspReports(many)).toHaveLength(20);
  });
});

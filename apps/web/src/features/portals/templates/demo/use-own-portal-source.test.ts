import { describe, expect, it } from 'vitest';
import { LedgerEntryKind, LedgerSource, type OrgLedgerPage } from '@adoptafacil/contracts';
import { orgLedgerAsPublic } from './use-own-portal-source';

const entry = (
  id: string,
  occurredOn: string,
  extra: Partial<OrgLedgerPage['items'][number]> = {},
) => ({
  id,
  organizationId: 'org-1',
  source: LedgerSource.Manual,
  kind: LedgerEntryKind.Expense,
  category: 'alimento' as const,
  occurredOn,
  amountCop: 1000,
  concept: `Mov ${id}`,
  hasSupport: true,
  supportFilename: 'factura.pdf',
  createdAt: `${occurredOn}T10:00:00Z`,
  ...extra,
});

describe('libro de la vista previa', () => {
  it('tiene la forma y el orden del libro público, sin datos internos', () => {
    const page: OrgLedgerPage = {
      items: [
        entry('a', '2026-10-01'),
        entry('b', '2026-11-02', { voidedAt: '2026-11-03T00:00:00Z', voidReason: 'Duplicado' }),
      ],
      totals: {
        incomeCop: 0,
        expenseCop: 1000,
        balanceCop: -1000,
        entryCount: 1,
        lastEntryOn: '2026-10-01',
      },
    };
    const pub = orgLedgerAsPublic(page);
    expect(pub.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(pub.items[0]).toMatchObject({ voided: true, voidReason: 'Duplicado' });
    expect(pub.items[1]).not.toHaveProperty('organizationId');
    expect(pub.items[1]).not.toHaveProperty('supportFilename');
    expect(pub.totals).toEqual(page.totals);
  });
});

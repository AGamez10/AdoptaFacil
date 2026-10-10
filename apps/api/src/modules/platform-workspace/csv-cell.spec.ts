import { csvCell } from './sensitive-actions.service';

describe('csvCell (audit export)', () => {
  it('neutralizes spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('quotes commas, quotes and line breaks; leaves plain text alone', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('workspace.ticket.note')).toBe('workspace.ticket.note');
  });
});

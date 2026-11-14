import { describe, expect, it } from 'vitest';
import { helpForPath } from './guide-content';

describe('helpForPath', () => {
  it('cada pantalla tiene su propia ayuda, sin heredar la de otra ruta parecida', () => {
    expect(helpForPath('/organizacion/documentos-por-firmar').title).toBe('Documentos por firmar');
    expect(helpForPath('/organizacion/documentos').title).not.toBe('Documentos por firmar');
    expect(helpForPath('/organizacion/contabilidad').title).toMatch(/Contabilidad/);
    expect(helpForPath('/organizacion/miembros').title).toBe('Miembros del equipo');
  });

  it('la ayuda de contabilidad distingue lo que da cada plan', () => {
    const tips = helpForPath('/organizacion/contabilidad').tips.map((t) =>
      typeof t === 'string' ? t : t.text,
    );
    expect(tips.join(' ')).toMatch(/Plan Gratis/);
    expect(tips.join(' ')).toMatch(/Crece y Pro/);
  });
});

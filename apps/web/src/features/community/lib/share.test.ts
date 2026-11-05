import { describe, expect, it } from 'vitest';
import { shareLink, shareTargets, shareText } from './share';

describe('community share links', () => {
  it('always shares the Open Graph bridge with the network as source', () => {
    const link = shareLink('p-1', 'whatsapp', 'https://adoptafacil.co');
    expect(link).toMatch(
      /\/public\/share\/c\/p-1\?s=whatsapp$|^https:\/\/adoptafacil\.co\/c\/p-1\?s=whatsapp$/,
    );
  });

  it('builds one encoded link per network, each tagged with its own source', () => {
    const targets = shareTargets('p-1', 'Jornada de adopción', 'https://adoptafacil.co');
    expect(targets.map((t) => t.network)).toEqual([
      'whatsapp',
      'facebook',
      'x',
      'linkedin',
      'telegram',
    ]);
    for (const target of targets) {
      expect(decodeURIComponent(target.href)).toContain(`?s=${target.network}`);
    }
    expect(targets[0].href.startsWith('https://wa.me/?text=Jornada%20de%20adopci%C3%B3n')).toBe(
      true,
    );
  });

  it('keeps the accompanying text short and branded', () => {
    expect(shareText({ body: 'a '.repeat(200) })).toMatch(/… · Míralo en AdoptaFácil$/);
    expect(shareText({ title: 'Hola', body: 'x' })).toBe('Hola · Míralo en AdoptaFácil');
  });
});

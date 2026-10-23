import { updateOrgProfileSchema } from './org.schemas';

/** Los enlaces públicos del perfil terminan como `href`/`src` en el portal público:
 *  solo se aceptan http(s), nunca `javascript:`/`data:` (XSS almacenado). */
describe('updateOrgProfileSchema · enlaces públicos', () => {
  const parse = (input: Record<string, unknown>) => updateOrgProfileSchema.safeParse(input);

  it('acepta enlaces http y https', () => {
    expect(parse({ socialLinks: { instagram: 'https://instagram.com/patitas' } }).success).toBe(
      true,
    );
    expect(parse({ socialLinks: { website: 'http://patitas.org' } }).success).toBe(true);
    expect(parse({ logoUrl: 'https://cdn.example.com/logo.png' }).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('rechaza %s en redes, logo, portadas y mapa', (bad) => {
    expect(parse({ socialLinks: { website: bad } }).success).toBe(false);
    expect(parse({ socialLinks: { facebook: bad } }).success).toBe(false);
    expect(parse({ logoUrl: bad }).success).toBe(false);
    expect(parse({ coverPhotos: [bad] }).success).toBe(false);
    expect(parse({ extendedContact: { mapUrl: bad } }).success).toBe(false);
  });
});

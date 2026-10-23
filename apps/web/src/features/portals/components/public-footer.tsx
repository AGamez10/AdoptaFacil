import type { OrganizationPublic } from '@adoptafacil/contracts';
import type { PublicHeaderNavItem } from './public-header';
import {
  IconArrowRight,
  IconFacebook,
  IconGlobe,
  IconInstagram,
  IconMail,
  IconPaw,
  IconTikTok,
  IconWhatsapp,
} from './portal-icons';
import { safeExternalUrl } from '../model/safe-url';
import styles from '../styles/public-portal.module.scss';

export interface PublicFooterProps {
  organization: Pick<
    OrganizationPublic,
    'name' | 'logoUrl' | 'socialLinks' | 'whatsapp' | 'contactEmail'
  >;
  navItems: readonly PublicHeaderNavItem[];
}

/**
 * Pie del portal público (§M14, rediseño T-D04). Mismos anclas reales del
 * header + los mismos campos reales de redes/contacto que `PortalSocialLinks`
 * (nunca un ícono/red inventados — YouTube no aparece porque
 * `OrganizationSocialLinks` no tiene ese campo hoy). Copyright con el año
 * actual (dinámico, nunca un año fijo).
 */
export function PublicFooter({ organization, navItems }: PublicFooterProps) {
  // Solo http(s): React no bloquea `javascript:` en href.
  const social = {
    instagram: safeExternalUrl(organization.socialLinks?.instagram),
    facebook: safeExternalUrl(organization.socialLinks?.facebook),
    tiktok: safeExternalUrl(organization.socialLinks?.tiktok),
    website: safeExternalUrl(organization.socialLinks?.website),
  };
  const socialIcons: Array<{ key: string; label: string; href: string; Icon: typeof IconGlobe }> =
    [];
  if (social.instagram) {
    socialIcons.push({
      key: 'instagram',
      label: 'Instagram',
      href: social.instagram,
      Icon: IconInstagram,
    });
  }
  if (social.facebook) {
    socialIcons.push({
      key: 'facebook',
      label: 'Facebook',
      href: social.facebook,
      Icon: IconFacebook,
    });
  }
  if (social.tiktok) {
    socialIcons.push({
      key: 'tiktok',
      label: 'TikTok',
      href: social.tiktok,
      Icon: IconTikTok,
    });
  }
  if (social.website) {
    socialIcons.push({
      key: 'website',
      label: 'Sitio web',
      href: social.website,
      Icon: IconGlobe,
    });
  }
  if (organization.whatsapp) {
    socialIcons.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/${organization.whatsapp.replace(/[^\d]/g, '')}`,
      Icon: IconWhatsapp,
    });
  }
  if (organization.contactEmail) {
    socialIcons.push({
      key: 'email',
      label: 'Correo',
      href: `mailto:${organization.contactEmail}`,
      Icon: IconMail,
    });
  }

  return (
    <footer className={styles.footer} data-testid="public-footer">
      <div className={styles.footer__top}>
        <div className={styles.footer__brand}>
          {organization.logoUrl ? (
            <img src={organization.logoUrl} alt="" className={styles.header__logo} />
          ) : (
            <span aria-hidden className={styles.header__logoFallback}>
              <IconPaw className="h-4 w-4" />
            </span>
          )}
          <span className={styles.header__name}>{organization.name}</span>
        </div>
        <nav className={styles.footer__nav} aria-label="Navegación del portal (pie de página)">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className={styles.footer__navLink}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className={styles.footer__bottom}>
        <p className={styles.footer__copyright}>
          © {new Date().getFullYear()} {organization.name}. Todos los derechos reservados.
        </p>
        <div className={styles.footer__social}>
          {socialIcons.map(({ key, label, href, Icon }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={styles.footer__socialIcon}
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
          <a href="#portal-top" aria-label="Volver arriba" className={styles.footer__socialIcon}>
            <IconArrowRight aria-hidden className="h-4 w-4 -rotate-90" />
          </a>
        </div>
      </div>
    </footer>
  );
}

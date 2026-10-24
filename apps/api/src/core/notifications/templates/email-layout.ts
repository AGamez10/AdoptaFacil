import type {
  EmailAccentColor,
  EmailCategory,
  EmailIcon,
  EmailTheme,
} from '@adoptafacil/contracts';
import type { EmailBrand } from '../branding/org-email-branding';
import { escapeHtml } from './email-render';

/**
 * The one HTML layout every AdoptaFácil email uses. Built for real inboxes
 * (Gmail, Outlook, Apple Mail, phones): table layout, inline styles only, no
 * external CSS/JS/fonts/images (so it looks right even with images blocked),
 * 600px card that shrinks on mobile, "bulletproof" button, hidden preheader.
 *
 * Every dynamic string reaching this file is ALREADY escaped HTML produced by
 * `email-render.ts`, except the ones escaped here (organization name, URLs).
 */

interface ThemeStyle {
  accent: string;
  soft: string;
  icon: string;
  kicker: string;
}

// Brand palette (packages/ui globals.scss): teal #25BAA6 / #198072, navy
// #202D3E, coral #FF8F66, gold #F2B84B. Accents are decorative (bar, icon
// bubble); text and the button keep AA contrast on white.
const THEMES: Record<EmailTheme, ThemeStyle> = {
  security: { accent: '#202D3E', soft: '#E8ECF2', icon: '🔒', kicker: 'Seguridad de tu cuenta' },
  donation: { accent: '#FF8F66', soft: '#FFF0EA', icon: '💛', kicker: 'Donaciones' },
  sponsorship: { accent: '#F2B84B', soft: '#FDF4E2', icon: '🐾', kicker: 'Apadrinamientos' },
  adoption: { accent: '#25BAA6', soft: '#E6F7F4', icon: '🏡', kicker: 'Adopciones' },
  volunteering: { accent: '#4F7CAC', soft: '#EAF1F8', icon: '🤝', kicker: 'Voluntariado' },
  community: { accent: '#25BAA6', soft: '#E6F7F4', icon: '📣', kicker: 'Novedades' },
  alert: { accent: '#E5604A', soft: '#FDECE8', icon: '⏰', kicker: 'Aviso importante' },
};

// Accent palette the editor offers (item 12). Decorative only, like the themes.
const ACCENTS: Record<EmailAccentColor, { accent: string; soft: string }> = {
  teal: { accent: '#25BAA6', soft: '#E6F7F4' },
  navy: { accent: '#202D3E', soft: '#E8ECF2' },
  coral: { accent: '#FF8F66', soft: '#FFF0EA' },
  gold: { accent: '#F2B84B', soft: '#FDF4E2' },
  blue: { accent: '#4F7CAC', soft: '#EAF1F8' },
  red: { accent: '#E5604A', soft: '#FDECE8' },
  purple: { accent: '#8E6CC8', soft: '#F1ECFA' },
  green: { accent: '#4C9A52', soft: '#EBF5EC' },
};

const INK = '#202D3E';
const MUTED = '#5B6878';
const BUTTON = '#198072';
const PAGE_BG = '#F2F5F4';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface LayoutInput {
  theme: EmailTheme;
  /** Optional overrides chosen in the editor (closed palette, validated). */
  accentColor?: EmailAccentColor;
  icon?: EmailIcon;
  category: EmailCategory;
  /** Escaped HTML. */
  preheaderHtml: string;
  headingHtml: string;
  paragraphsHtml: string[];
  ctaLabelHtml?: string;
  /** Raw, already validated absolute http(s) URL. */
  ctaUrl?: string;
  footerNoteHtml?: string;
  /** Raw (escaped here). */
  organizationName?: string;
  /** Raw, already validated absolute URL (bulk emails only). */
  unsubscribeUrl?: string;
  /** Raw, already validated absolute URL of the web app (footer link). */
  webBaseUrl: string;
  /**
   * Organization brand (plan Crece/Pro, only with `organizationName`): the
   * organization's name heads the email ("a través de AdoptaFácil" below) and
   * its portal colors paint the top bar and the button. The footer (who sends,
   * Ley 1581, unsubscribe) never changes.
   */
  brand?: EmailBrand;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const color = (value: string | undefined, fallback: string) =>
  value && HEX_RE.test(value) ? value : fallback;

export function themeStyle(theme: EmailTheme): ThemeStyle {
  return THEMES[theme];
}

export function renderLayout(input: LayoutInput): string {
  const theme = {
    ...THEMES[input.theme],
    ...(input.accentColor ? ACCENTS[input.accentColor] : {}),
    ...(input.icon ? { icon: input.icon } : {}),
  };
  const org = input.organizationName ? escapeHtml(input.organizationName) : '';
  const web = escapeHtml(input.webBaseUrl);

  const branded = Boolean(input.brand && org);
  const accent = branded ? color(input.brand?.accent, theme.accent) : theme.accent;
  const buttonBg = branded ? color(input.brand?.button, BUTTON) : BUTTON;
  const buttonText = branded ? color(input.brand?.buttonText, '#ffffff') : '#ffffff';

  const sender = branded
    ? `<span style="font-size:13px;color:${MUTED};">a través de AdoptaFácil</span>`
    : org
      ? `<span style="font-size:13px;color:${MUTED};">${org} <span style="color:#9AA5B1;">·</span> a través de AdoptaFácil</span>`
      : `<span style="font-size:13px;color:${MUTED};">Infraestructura digital para el rescate animal</span>`;
  const masthead = branded
    ? `<td style="font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${INK};word-break:break-word;">${org}</td>`
    : `<td style="font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${INK};">🐾 Adopta<span style="color:${BUTTON};">Fácil</span></td>`;

  const paragraphs = input.paragraphsHtml
    .map(
      (p) => `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${INK};">${p}</p>`,
    )
    .join('\n');

  const button =
    input.ctaLabelHtml && input.ctaUrl
      ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
  <tr>
    <td align="center" bgcolor="${buttonBg}" style="border-radius:10px;">
      <a href="${escapeHtml(input.ctaUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${buttonText};text-decoration:none;border-radius:10px;">${input.ctaLabelHtml}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:${MUTED};">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${escapeHtml(input.ctaUrl)}" style="color:${BUTTON};word-break:break-all;">${escapeHtml(input.ctaUrl)}</a></p>`
      : '';

  const note = input.footerNoteHtml
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0 0;"><tr><td style="background:${theme.soft};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;color:${INK};word-break:break-word;">${input.footerNoteHtml}</td></tr></table>`
    : '';

  const legal =
    input.category === 'bulk'
      ? `Recibes este correo porque te relacionaste con ${org || 'AdoptaFácil'} en AdoptaFácil. ` +
        `Tratamos tus datos conforme a la Ley 1581 de 2012. ` +
        (input.unsubscribeUrl
          ? `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">No quiero recibir más correos como este</a>.`
          : '')
      : 'Este es un correo de servicio sobre tu actividad en AdoptaFácil; no es publicidad. ' +
        'Tratamos tus datos conforme a la Ley 1581 de 2012.';

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${input.headingHtml}</title>
<style>
  @media (max-width:620px){ .af-card{width:100% !important;border-radius:0 !important;} .af-pad{padding-left:22px !important;padding-right:22px !important;} }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${input.preheaderHtml}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" class="af-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:${FONT};box-shadow:0 2px 12px rgba(32,45,62,0.06);">
        <tr><td style="height:6px;line-height:6px;font-size:0;background:${accent};">&nbsp;</td></tr>
        <tr>
          <td class="af-pad" style="padding:24px 40px 8px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${masthead}
              </tr>
              <tr><td style="padding-top:2px;">${sender}</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="af-pad" style="padding:20px 40px 0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;border-radius:24px;background:${theme.soft};font-size:24px;line-height:48px;">${theme.icon}</td>
                <td style="padding-left:12px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">${theme.kicker}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="af-pad" style="padding:16px 40px 8px 40px;">
            <h1 style="margin:0 0 18px 0;font-size:26px;line-height:1.25;font-weight:800;color:${INK};">${input.headingHtml}</h1>
            ${paragraphs}
            ${button}
            ${note}
          </td>
        </tr>
        <tr>
          <td class="af-pad" style="padding:24px 40px 28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E3E8EC;">
              <tr>
                <td style="padding-top:18px;font-size:12px;line-height:1.6;color:${MUTED};">
                  <strong style="color:${INK};">AdoptaFácil</strong> · Transparencia y confianza para el rescate animal en Colombia.<br>
                  ${legal}<br>
                  <a href="${web}" style="color:${BUTTON};text-decoration:none;">${web.replace(/^https?:\/\//, '')}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderTextFooter(
  category: EmailCategory,
  organizationName?: string,
  unsubscribeUrl?: string,
): string {
  const lines = [
    '—',
    'AdoptaFácil · Transparencia y confianza para el rescate animal en Colombia.',
  ];
  if (category === 'bulk') {
    lines.push(
      `Recibes este correo porque te relacionaste con ${organizationName || 'AdoptaFácil'}. Tratamos tus datos conforme a la Ley 1581 de 2012.`,
    );
    if (unsubscribeUrl) lines.push(`Para no recibir más correos como este: ${unsubscribeUrl}`);
  } else {
    lines.push('Correo de servicio sobre tu actividad; no es publicidad. Ley 1581 de 2012.');
  }
  return lines.join('\n');
}

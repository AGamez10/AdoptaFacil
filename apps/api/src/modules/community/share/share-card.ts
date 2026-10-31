import sharp from 'sharp';
import { PostType, type PublicCommunityPost } from '@adoptafacil/contracts';
import { SHARE_CARD_ART_JPEG_BASE64 } from './share-card-art';

/**
 * Tarjeta para redes (Open Graph / Twitter Cards) de una publicación pública
 * de la comunidad: 1200×630, el mismo lenguaje visual de la imagen social de
 * la landing (crema a la izquierda, perro y gato sobre menta a la derecha).
 *
 * Privacidad: la tarjeta NUNCA lleva fotos subidas por la gente (pueden
 * mostrar personas o menores) ni datos de contacto; solo el título, un
 * extracto, el tipo y el nombre público de quien publica (la organización o
 * el primer nombre de la persona, ya recortado por la base de datos).
 */

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

const INK = '#14202e';
const INK_SOFT = '#3f4c5c';
const CREAM = '#fff8ef';
const TEAL_INK = '#0d6c5f';
const MINT = '#c8f2e6';
const FONT = "Inter, 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

export const POST_TYPE_LABEL: Record<PostType, string> = {
  [PostType.General]: 'Comunidad',
  [PostType.Campaign]: 'Campaña',
  [PostType.Notice]: 'Aviso',
  [PostType.Event]: 'Evento',
};

/** Texto seguro dentro de SVG/HTML. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Quita emojis y caracteres de control: el servidor no tiene fuente de emojis
 *  y un cuadro vacío en la tarjeta se ve descuidado. */
export function cardSafeText(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\u{FE0F}|\u{200D}/gu, '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parte `text` en a lo sumo `maxLines` líneas de ~`maxChars` caracteres (ancho
 * medio de la fuente), cortando por palabras y cerrando con "…" si sobra.
 */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let index = 0;
  for (; index < words.length; index += 1) {
    const word =
      words[index].length > maxChars ? `${words[index].slice(0, maxChars - 1)}…` : words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
    current = '';
  }
  const truncated = index < words.length || current !== '';
  if (truncated && lines.length > 0) {
    const last = lines[lines.length - 1];
    const room = Math.max(maxChars - 1, 1);
    lines[lines.length - 1] =
      `${(last.length > room ? last.slice(0, room) : last).replace(/[\s.,;:]+$/, '')}…`;
  }
  return lines;
}

/** Título y extracto que se muestran (sin título, la primera frase hace de título). */
export function cardCopy(post: PublicCommunityPost): { headline: string; excerpt: string } {
  const body = cardSafeText(post.body);
  const title = post.title ? cardSafeText(post.title) : '';
  if (title) return { headline: title, excerpt: body };
  const sentence = body.match(/^(.{12,140}?[.!?])(\s|$)/);
  if (sentence) return { headline: sentence[1], excerpt: body.slice(sentence[1].length).trim() };
  return { headline: body, excerpt: '' };
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  attrs: string,
): string {
  return lines
    .map((line, i) => `<text x="${x}" y="${y + i * lineHeight}" ${attrs}>${escapeXml(line)}</text>`)
    .join('');
}

/** SVG de la tarjeta (exportado para pruebas). */
export function buildShareCardSvg(post: PublicCommunityPost, siteHost: string): string {
  const { headline, excerpt } = cardCopy(post);
  const titleLines = wrapLines(headline, 20, 3);
  const titleSize = titleLines.length >= 3 ? 50 : 56;
  const titleLineHeight = titleSize + 8;
  const titleTop = 252;
  const excerptTop = titleTop + titleLines.length * titleLineHeight + 6;
  const excerptLines = excerpt ? wrapLines(excerpt, 46, titleLines.length >= 3 ? 1 : 2) : [];
  const typeLabel = POST_TYPE_LABEL[post.type] ?? 'Comunidad';
  const chip = (
    typeLabel === 'Comunidad' ? 'Comunidad AdoptaFácil' : `${typeLabel} · Comunidad AdoptaFácil`
  ).toUpperCase();
  const chipWidth = Math.round(chip.length * 11.8 + 40);
  const author = cardSafeText(post.authorDisplayName).slice(0, 48);
  const cta = `Míralo en ${siteHost}`;
  const ctaWidth = Math.round(cta.length * 12.4 + 76);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}">
  <rect width="100%" height="100%" fill="${CREAM}"/>
  <image x="760" y="0" width="440" height="630" href="data:image/jpeg;base64,${SHARE_CARD_ART_JPEG_BASE64}" xlink:href="data:image/jpeg;base64,${SHARE_CARD_ART_JPEG_BASE64}"/>
  <text x="84" y="104" font-family="${FONT}" font-size="34" font-weight="800" fill="${INK}">Adopta<tspan fill="${TEAL_INK}">Fácil</tspan></text>
  <rect x="84" y="140" rx="20" ry="20" width="${chipWidth}" height="40" fill="${MINT}"/>
  <text x="104" y="167" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="1.2" fill="${TEAL_INK}">${escapeXml(chip)}</text>
  ${textLines(titleLines, 84, titleTop, titleLineHeight, `font-family="${FONT}" font-size="${titleSize}" font-weight="800" fill="${INK}"`)}
  ${textLines(excerptLines, 84, excerptTop + 14, 34, `font-family="${FONT}" font-size="25" font-weight="500" fill="${INK_SOFT}"`)}
  <text x="84" y="530" font-family="${FONT}" font-size="22" font-weight="600" fill="${INK_SOFT}">Publicado por <tspan fill="${INK}" font-weight="800">${escapeXml(author)}</tspan></text>
  <rect x="84" y="552" rx="26" ry="26" width="${ctaWidth}" height="52" fill="${TEAL_INK}"/>
  <text x="112" y="586" font-family="${FONT}" font-size="21" font-weight="800" fill="#ffffff">${escapeXml(cta)}  →</text>
</svg>`;
}

/** PNG 1200×630 listo para `og:image`. */
export async function renderShareCard(
  post: PublicCommunityPost,
  siteHost: string,
): Promise<Buffer> {
  return sharp(Buffer.from(buildShareCardSvg(post, siteHost)))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

/** Orígenes de tráfico que aceptamos en `utm_source` (el resto cae en "share"). */
export const SHARE_SOURCES = [
  'whatsapp',
  'facebook',
  'x',
  'linkedin',
  'telegram',
  'copy',
  'native',
] as const;

export function shareSource(value: string | undefined): string {
  return (SHARE_SOURCES as readonly string[]).includes(value ?? '') ? (value as string) : 'share';
}

/** Descripción corta (≤160) para `og:description`. */
export function shareDescription(post: PublicCommunityPost): string {
  const { excerpt, headline } = cardCopy(post);
  const base = excerpt || headline;
  const text = base.length > 157 ? `${base.slice(0, 157).replace(/\s+\S*$/, '')}…` : base;
  return text || 'Una publicación de la comunidad de AdoptaFácil.';
}

export interface ShareHtmlInput {
  post: PublicCommunityPost;
  /** URL de la página de la publicación en la web (canónica, sin UTM). */
  canonicalUrl: string;
  /** Destino del visitante, con los parámetros de origen. */
  targetUrl: string;
  /** URL absoluta de la tarjeta PNG. */
  imageUrl: string;
}

/**
 * Página mínima para los rastreadores de redes (WhatsApp, Facebook, X,
 * LinkedIn, Telegram no ejecutan JavaScript): lleva las etiquetas Open Graph y
 * Twitter Card y manda a la persona a la publicación en la web. `noindex`: lo
 * que se indexa es la página canónica, no este puente.
 */
export function buildShareHtml({
  post,
  canonicalUrl,
  targetUrl,
  imageUrl,
}: ShareHtmlInput): string {
  const { headline } = cardCopy(post);
  const title = `${headline.length > 90 ? `${headline.slice(0, 89)}…` : headline} · ${post.authorDisplayName}`;
  const description = shareDescription(post);
  const alt = `Publicación de ${post.authorDisplayName} en la comunidad de AdoptaFácil: ${headline}`;
  const e = escapeXml;
  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} | Comunidad AdoptaFácil</title>
<meta name="description" content="${e(description)}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${e(canonicalUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="AdoptaFácil">
<meta property="og:locale" content="es_CO">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(canonicalUrl)}">
<meta property="og:image" content="${e(imageUrl)}">
<meta property="og:image:secure_url" content="${e(imageUrl)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${SHARE_CARD_WIDTH}">
<meta property="og:image:height" content="${SHARE_CARD_HEIGHT}">
<meta property="og:image:alt" content="${e(alt)}">
<meta property="article:published_time" content="${e(post.createdAt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(imageUrl)}">
<meta name="twitter:image:alt" content="${e(alt)}">
<meta http-equiv="refresh" content="0; url=${e(targetUrl)}">
</head>
<body style="font-family: system-ui, sans-serif; background: ${CREAM}; color: ${INK}; padding: 32px;">
<p><a href="${e(targetUrl)}" style="color: ${TEAL_INK}; font-weight: 700;">Ver la publicación en AdoptaFácil</a></p>
</body>
</html>`;
}

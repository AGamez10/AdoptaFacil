import type { AdoptionSignerRole } from '@adoptafacil/contracts';

/**
 * Correo con la copia del contrato de adopción firmado por todas las partes.
 * Builders PUROS (sin framework): el envío, la idempotencia y el aislamiento
 * entre organizaciones viven en `AdoptionContractCopyService`. Cuando exista el
 * catálogo de plantillas del superadmin, puede envolver estas funciones sin
 * tocar el envío.
 *
 * Todo dato variable (nombres, ciudad, nombre del animal) viene de usuarios:
 * se escapa para HTML y se le quitan saltos de línea antes de ir al asunto,
 * así no puede inyectar marcado ni cabeceras.
 */

export interface AdoptionContractCopyEmailInput {
  recipientName: string;
  recipientRole: AdoptionSignerRole;
  organizationName: string;
  animalName: string;
  contractId: string;
  contentHash: string;
  /** ISO-8601 UTC del sellado. */
  signedAt: string;
  webBaseUrl: string;
}

/** Escapa los cinco caracteres con significado en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// eslint-disable-next-line no-control-regex
const CONTROL_RUN = /[\u0000-\u001f\u007f]+/g;

/** Texto de una línea, sin controles ni saltos (asunto, nombres), acotado. */
export function singleLine(value: string, max = 120): string {
  const clean = value.replace(CONTROL_RUN, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Enlace al contrato dentro de AdoptaFácil (requiere sesión). */
export function buildContractLink(webBaseUrl: string, contractId: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/adopciones/contratos/${encodeURIComponent(contractId)}`;
}

/** Nombre de archivo del adjunto: solo ASCII seguro. */
export function buildContractAttachmentName(animalName: string, contractId: string): string {
  const slug =
    animalName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'animal';
  return `contrato-adopcion-${slug}-${contractId.slice(0, 8)}.pdf`;
}

function formatCO(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function roleIntro(input: AdoptionContractCopyEmailInput, animal: string, org: string): string {
  if (input.recipientRole === 'organization_representative') {
    return `El contrato de adopción de ${animal} quedó firmado por todas las partes. Te enviamos la copia para el archivo de ${org}.`;
  }
  if (input.recipientRole === 'adopter') {
    return `¡Felicidades! Tú y ${org} firmaron el contrato de adopción de ${animal}. Aquí está tu copia: guárdala, es tu respaldo y el de ${animal}.`;
  }
  return `El contrato de adopción de ${animal} con ${org}, que firmaste, quedó firmado por todas las partes. Aquí está tu copia.`;
}

export function buildContractCopySubject(input: AdoptionContractCopyEmailInput): string {
  return singleLine(
    `Copia firmada: contrato de adopción de ${input.animalName} · ${input.organizationName}`,
    150,
  );
}

export function buildContractCopyText(input: AdoptionContractCopyEmailInput): string {
  const animal = singleLine(input.animalName, 80);
  const org = singleLine(input.organizationName, 120);
  return [
    `Hola ${singleLine(input.recipientName, 120)},`,
    '',
    roleIntro(input, animal, org),
    '',
    'Adjuntamos el contrato completo en PDF, con las firmas de todas las partes.',
    `Firmado el ${formatCO(input.signedAt)}.`,
    `Huella SHA-256 del contenido: ${input.contentHash}`,
    '',
    'También puedes consultarlo cuando quieras en AdoptaFácil:',
    buildContractLink(input.webBaseUrl, input.contractId),
    '',
    'Cada parte recibe una copia idéntica. Si algo no coincide con lo que firmaste, responde a la organización.',
    '',
    `— ${org}, con AdoptaFácil`,
  ].join('\n');
}

/**
 * Versión HTML: tabla de 600 px con estilos en línea (lo único que respetan los
 * clientes de correo), legible sin imágenes y en modo oscuro del cliente.
 */
export function buildContractCopyHtml(input: AdoptionContractCopyEmailInput): string {
  const animal = escapeHtml(singleLine(input.animalName, 80));
  const org = escapeHtml(singleLine(input.organizationName, 120));
  const name = escapeHtml(singleLine(input.recipientName, 120));
  const link = escapeHtml(buildContractLink(input.webBaseUrl, input.contractId));
  const hash = escapeHtml(input.contentHash);
  const date = escapeHtml(formatCO(input.signedAt));
  const intro = roleIntro(input, animal, org);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato de adopción firmado</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#1f2a24">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3ddd0">
<tr><td style="background:#1d4d3b;padding:22px 28px;color:#ffffff">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${org}</div>
<div style="font-size:24px;line-height:1.25;margin-top:6px">Contrato de adopción de ${animal}, firmado</div>
</td></tr>
<tr><td style="padding:26px 28px 8px;font-size:16px;line-height:1.6">
<p style="margin:0 0 14px">Hola ${name},</p>
<p style="margin:0 0 14px">${intro}</p>
<p style="margin:0 0 14px">Adjuntamos el contrato completo en PDF, con las firmas de todas las partes.</p>
</td></tr>
<tr><td style="padding:0 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5ef;border-radius:8px;border:1px solid #ebe6da">
<tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#3d4a43">
<strong style="color:#1f2a24">Firmado el</strong> ${date}<br>
<strong style="color:#1f2a24">Huella SHA-256</strong><br>
<span style="font-family:'Courier New',monospace;font-size:12px;word-break:break-all">${hash}</span>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 28px">
<a href="${link}" style="display:inline-block;background:#1d4d3b;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;padding:12px 22px;border-radius:6px">Ver el contrato en AdoptaFácil</a>
</td></tr>
<tr><td style="padding:0 28px 26px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.6;color:#5c6a62">
Cada parte recibe una copia idéntica y el documento queda guardado en AdoptaFácil. La huella permite comprobar que el contenido no cambió desde la firma. Si algo no coincide con lo que firmaste, responde a ${org}.
</td></tr>
<tr><td style="background:#f7f5ef;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#7a857f;border-top:1px solid #ebe6da">
${org} usa AdoptaFácil para gestionar sus adopciones. AdoptaFácil no es parte del contrato.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

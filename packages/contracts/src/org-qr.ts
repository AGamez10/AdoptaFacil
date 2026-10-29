// Module: portals · QR fijo por organización · Contracts owner: @fabian
//
// Cada organización tiene UNA etiqueta QR que nunca cambia: codifica
// `<appOrigin>/q/<code>`. Lo único que la organización cambia desde su panel es
// el DESTINO, guardado como tipo + id (nunca una URL): donar, una de sus
// campañas activas o apadrinar uno de sus animales. Al escanear, la API valida
// que el destino siga siendo de la organización y publicable; si no, lleva a
// donar a esa misma organización.
//
// Browser-safe, dependency-free.

export const QR_TARGET_KINDS = ['donate', 'campaign', 'animal'] as const;
export type QrTargetKind = (typeof QR_TARGET_KINDS)[number];

/** 8 caracteres sin 0/1/i/l/o. Igual al CHECK de `organization_qr_links.code`. */
export const ORG_QR_CODE_PATTERN = /^[a-hjkmnp-z2-9]{8}$/;

/** Ruta pública del QR fijo. */
export const ORG_QR_PATH_PREFIX = '/q/';

export interface QrTarget {
  kind: QrTargetKind;
  /** Campaña o animal; `null` cuando `kind` es `donate`. */
  id: string | null;
}

export interface QrTargetOption {
  id: string;
  label: string;
}

/** `GET /org/qr` — el QR propio, su destino y lo que se puede elegir. */
export interface OrganizationQr {
  code: string;
  /** Destino guardado. */
  target: QrTarget;
  /** Destino al que lleva HOY (cae a `donate` si el guardado dejó de valer). */
  effectiveTarget: QrTarget;
  /** Campañas activas de la organización. */
  campaigns: QrTargetOption[];
  /** Animales disponibles con un plan de apadrinamiento activo. */
  animals: QrTargetOption[];
  /** Escaneos de los últimos 30 días (UTC), todos los destinos. */
  scansLast30Days: number;
}

/** `PUT /org/qr/target` */
export interface UpdateOrganizationQrTargetInput {
  kind: QrTargetKind;
  id?: string | null;
}

/** `GET /public/qr/:code` — sin sesión. Solo el slug y el destino validado. */
export interface PublicQrResolution {
  slug: string;
  target: QrTarget;
}

/** URL que va impresa en el QR. */
export function buildOrganizationQrUrl(code: string, appOrigin: string): string | null {
  if (!ORG_QR_CODE_PATTERN.test(code)) return null;
  return `${appOrigin.trim().replace(/\/+$/, '')}${ORG_QR_PATH_PREFIX}${code}`;
}

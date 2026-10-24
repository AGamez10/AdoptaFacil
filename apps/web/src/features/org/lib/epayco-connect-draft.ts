/**
 * Asistente "Conectar ePayco" (ADR-PAG-002): pasos, textos fijos y el
 * borrador que permite pausar y seguir después.
 *
 * ePayco no ofrece "conectar con un clic" (no hay OAuth): abrir la cuenta y
 * verificar la identidad ocurren en ePayco (exigencia legal) y las llaves
 * viven en su panel. El asistente hace ese camino lo más corto y claro
 * posible, y deja pausar sin perder el avance.
 */

/** Registro de cuentas en ePayco. TODO(client): confirmar la URL exacta de
 *  registro que ePayco recomienda para organizaciones/personas naturales. */
export const EPAYCO_REGISTER_URL = 'https://dashboard.epayco.co/register';

/** Dónde están las llaves dentro del panel de ePayco (texto, no enlace). */
export const EPAYCO_KEYS_LOCATION = 'En ePayco: Integraciones → Llaves API';

export type EpaycoWizardStep = 'start' | 'guide' | 'cust-id' | 'public-key' | 'secrets' | 'review';

/** Respuesta a "¿Tu refugio ya tiene cuenta en ePayco?". */
export type EpaycoAccountPath = 'has-account' | 'no-account' | 'unsure';

export const EPAYCO_WIZARD_STEPS: readonly EpaycoWizardStep[] = [
  'start',
  'guide',
  'cust-id',
  'public-key',
  'secrets',
  'review',
];

/** Etapas que ve la persona (el indicador "Paso N de 5"). "start" y "guide"
 *  son la misma etapa: tener la cuenta lista. */
export const EPAYCO_PROGRESS_STEPS = [
  { key: 'account', label: 'Tu cuenta' },
  { key: 'cust-id', label: 'Número de cliente' },
  { key: 'public-key', label: 'Llave pública' },
  { key: 'secrets', label: 'Llaves secretas' },
  { key: 'review', label: 'Revisar' },
] as const;

export const EPAYCO_TOTAL_PROGRESS_STEPS = EPAYCO_PROGRESS_STEPS.length;

/** 0-based index de la etapa visible para un paso del asistente. */
export function progressIndexForStep(step: EpaycoWizardStep): number {
  switch (step) {
    case 'start':
    case 'guide':
      return 0;
    case 'cust-id':
      return 1;
    case 'public-key':
      return 2;
    case 'secrets':
      return 3;
    case 'review':
      return 4;
  }
}

/** Lo que conviene tener a mano para abrir la cuenta. Los requisitos exactos
 *  los define ePayco (y pueden cambiar): por eso la guía lo dice explícito.
 *  TODO(client): validar esta lista con ePayco. */
export const EPAYCO_CHECKLIST = [
  { id: 'cedula', label: 'Tu cédula de ciudadanía (foto por ambos lados)' },
  {
    id: 'bank-certificate',
    label: 'Certificado de tu cuenta bancaria (se descarga en la app o la web de tu banco)',
  },
  { id: 'contact', label: 'Un correo y un celular a los que tengas acceso' },
  {
    id: 'rut',
    label: 'Si tu refugio es fundación o empresa: RUT y certificado de Cámara de Comercio',
  },
] as const;

export type EpaycoChecklistId = (typeof EPAYCO_CHECKLIST)[number]['id'];

/**
 * Borrador del asistente, por organización, en `localStorage`.
 *
 * SOLO datos no secretos: paso, camino elegido, la lista marcada, el número de
 * cliente (P_CUST_ID_CLIENTE) y la llave PÚBLICA. Las dos llaves secretas
 * (P_KEY y PRIVATE_KEY) NUNCA se guardan aquí: `localStorage` es texto plano,
 * lo puede leer cualquier script de la página y sobrevive en un computador
 * compartido (algo común en un refugio). Las secretas solo viven en memoria
 * del asistente hasta que se envían, y se borran al enviar, al pausar o al
 * salir. Por eso, al retomar un borrador, se vuelven a pegar.
 */
export interface EpaycoConnectDraft {
  step: EpaycoWizardStep;
  path: EpaycoAccountPath | null;
  checklist: EpaycoChecklistId[];
  custId: string;
  publicKey: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

const KEY_PREFIX = 'af:epayco-connect-draft:';
const MAX_TEXT = 200;

export function epaycoDraftKey(orgId: string): string {
  return `${KEY_PREFIX}${orgId}`;
}

const PATHS: readonly EpaycoAccountPath[] = ['has-account', 'no-account', 'unsure'];
const CHECKLIST_IDS = EPAYCO_CHECKLIST.map((item) => item.id) as readonly string[];

function text(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';
}

/**
 * Construye el borrador campo por campo (nunca con spread): aunque alguien le
 * pase un objeto con llaves secretas, estas no llegan a `localStorage`.
 */
function sanitize(raw: unknown): EpaycoConnectDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const step = EPAYCO_WIZARD_STEPS.includes(value.step as EpaycoWizardStep)
    ? (value.step as EpaycoWizardStep)
    : null;
  if (!step) return null;
  const path = PATHS.includes(value.path as EpaycoAccountPath)
    ? (value.path as EpaycoAccountPath)
    : null;
  const checklist = Array.isArray(value.checklist)
    ? (value.checklist.filter(
        (id): id is EpaycoChecklistId => typeof id === 'string' && CHECKLIST_IDS.includes(id),
      ) as EpaycoChecklistId[])
    : [];
  return {
    step,
    path,
    checklist: Array.from(new Set(checklist)),
    custId: text(value.custId),
    publicKey: text(value.publicKey),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

export function loadEpaycoDraft(orgId: string | undefined): EpaycoConnectDraft | null {
  if (!orgId) return null;
  try {
    const raw = window.localStorage.getItem(epaycoDraftKey(orgId));
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveEpaycoDraft(
  orgId: string | undefined,
  draft: Omit<EpaycoConnectDraft, 'updatedAt'>,
): void {
  if (!orgId) return;
  const clean = sanitize({ ...draft, updatedAt: new Date().toISOString() });
  if (!clean) return;
  try {
    window.localStorage.setItem(epaycoDraftKey(orgId), JSON.stringify(clean));
  } catch {
    // Navegación privada / almacenamiento lleno: el asistente sigue
    // funcionando, solo no recuerda el avance.
  }
}

export function clearEpaycoDraft(orgId: string | undefined): void {
  if (!orgId) return;
  try {
    window.localStorage.removeItem(epaycoDraftKey(orgId));
  } catch {
    // Igual que arriba: nada que hacer.
  }
}

/** Paso donde se retoma un borrador: las llaves secretas no se guardan, así
 *  que "Revisar" vuelve a "Llaves secretas" para pegarlas de nuevo. */
export function resumeStep(draft: EpaycoConnectDraft): EpaycoWizardStep {
  return draft.step === 'review' ? 'secrets' : draft.step;
}

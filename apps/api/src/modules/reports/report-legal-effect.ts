import type {
  LegalRepresentativeRole,
  OrgReportKind,
  OrgReportLegalEffect,
} from '@adoptafacil/contracts';

/**
 * Estados de formalización en los que la organización existe como persona
 * jurídica y, por tanto, tiene un representante legal cuya firma obliga a la
 * entidad. `informal` (hogar de paso, rescatista) y `en_proceso` NO: sus
 * reportes son siempre informativos.
 *
 * TODO(estados formales): cuando la matriz "estado → funciones" del hilo de
 * estados formales y verificación OCR llegue a la rama de integración, este
 * conjunto debe leerse de ahí (y exigir que los documentos hayan sido
 * verificados por la plataforma, no solo autodeclarados — hallazgo SEC-003).
 */
const FORMAL_STATES = new Set(['formalizada', 'esal', 'esal_rte']);

export interface LegalEffectInput {
  kind: OrgReportKind;
  formalizationState: string;
  rteVigente: boolean;
  hasNit: boolean;
  /** Roles que firmarán efectivamente (ya filtrados a los registrados). */
  signerRoles: readonly LegalRepresentativeRole[];
}

export function isFormalState(state: string): boolean {
  return FORMAL_STATES.has(state);
}

/**
 * Qué valor tiene el documento (ver `OrgReportLegalEffect` en contracts):
 * - sin formalidad o sin firma del representante legal ⇒ `informative`;
 * - donaciones de una ESAL con RTE vigente y NIT, firmadas por el
 *   representante legal Y por revisor fiscal o contador (art. 125-2 E.T.)
 *   ⇒ `certified`;
 * - el resto de organizaciones formalizadas con firma del representante
 *   legal ⇒ `signed`.
 */
export function computeLegalEffect(input: LegalEffectInput): OrgReportLegalEffect {
  if (!isFormalState(input.formalizationState)) return 'informative';
  if (!input.signerRoles.includes('legal_representative')) return 'informative';
  if (
    input.kind === 'donations' &&
    input.formalizationState === 'esal_rte' &&
    input.rteVigente &&
    input.hasNit &&
    (input.signerRoles.includes('fiscal_reviewer') || input.signerRoles.includes('accountant'))
  ) {
    return 'certified';
  }
  return 'signed';
}

/**
 * Firmantes por defecto (TODO(client): los estatutos de cada organización
 * pueden fijar otros; el usuario puede escoger entre los registrados):
 * - donaciones: representante legal + revisor fiscal, o contador si no hay
 *   revisor fiscal registrado;
 * - servicio social: representante legal.
 */
export function defaultSignerRoles(
  kind: OrgReportKind,
  registered: ReadonlySet<LegalRepresentativeRole>,
): LegalRepresentativeRole[] {
  const roles: LegalRepresentativeRole[] = [];
  if (registered.has('legal_representative')) roles.push('legal_representative');
  if (kind === 'donations') {
    if (registered.has('fiscal_reviewer')) roles.push('fiscal_reviewer');
    else if (registered.has('accountant')) roles.push('accountant');
  }
  return roles;
}

/** Orden estable de firmas en el documento. */
export const SIGNER_ORDER: readonly LegalRepresentativeRole[] = [
  'legal_representative',
  'fiscal_reviewer',
  'accountant',
];

export const SIGNER_ROLE_LABEL: Record<LegalRepresentativeRole, string> = {
  legal_representative: 'Representante legal',
  fiscal_reviewer: 'Revisor fiscal',
  accountant: 'Contador público',
};

/** Pasos concretos para que el próximo reporte tenga más valor. */
export function nextStepsFor(input: {
  formalizationState: string;
  rteVigente: boolean;
  hasNit: boolean;
  registered: ReadonlySet<LegalRepresentativeRole>;
}): string[] {
  const steps: string[] = [];
  if (!isFormalState(input.formalizationState)) {
    steps.push(
      'Tus reportes salen como comprobantes informativos, sin efecto legal. Formaliza tu organización (Documentos → Formalización) para que salgan firmados.',
    );
    return steps;
  }
  if (!input.registered.has('legal_representative')) {
    steps.push(
      'Registra la firma del representante legal (Documentos → Representante legal) para que tus reportes salgan firmados.',
    );
  }
  if (input.formalizationState === 'esal_rte' && input.rteVigente) {
    if (!input.hasNit) {
      steps.push('Completa el NIT en el perfil de la organización para certificar donaciones.');
    }
    if (!input.registered.has('fiscal_reviewer') && !input.registered.has('accountant')) {
      steps.push(
        'Registra la firma del revisor fiscal o del contador: el art. 125-2 del Estatuto Tributario exige una de las dos para certificar donaciones.',
      );
    }
  } else {
    steps.push(
      'El informe de donaciones solo sale certificado (con valor tributario) cuando la organización es ESAL con RTE vigente.',
    );
  }
  return steps;
}

import {
  DocumentType,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type DianVerificationCheckStatus,
} from '@adoptafacil/contracts';

/**
 * Pure formalization state machine (RF02). The valid path is the ordered
 * sequence Informal → EnProceso → Formalizada → ESAL → ESAL_RTE. Movement is one
 * ADJACENT step at a time: forward (i → i+1) freely, or backward (i → i-1) with
 * a reason (team decision — the base document fixes the sequence but not the
 * per-transition requirements; those stay parametrizable).
 *
 * T-103: a forward step MAY additionally be gated by documents — see
 * {@link TRANSITION_REQUIREMENTS} and {@link checkTransition}'s `ctx`. The base
 * document does NOT fix WHICH documents gate each step, so the catalog is left
 * empty (TODO(client)); the mechanism is fully wired end-to-end (see
 * FormalizationService, which loads the org's approved & current document types
 * and passes them in).
 */
export type TransitionKind = 'forward' | 'backward';

export interface TransitionCheck {
  allowed: boolean;
  kind?: TransitionKind;
  /** Backward moves require a reason. */
  requiresReason: boolean;
  /** Present when `allowed` is false — a clear, user-facing message. */
  error?: string;
}

/**
 * Parametrizable per-transition document requirements, keyed by the TARGET state
 * of a forward step: to advance INTO that state, the listed document types must
 * be Approved AND current (vigente) for the organization.
 *
 * Decisión del cliente (hilo "Estados formales y verificación OCR", 2026-10-08):
 * las funciones de organización formal se habilitan solo después de que la
 * plataforma verifique sus documentos. Por eso entrar a Formalizada exige el RUT
 * y el certificado de existencia y representación legal APROBADOS y vigentes.
 * ESAL y ESAL_RTE además solo los asigna la plataforma (ver abajo). Las
 * organizaciones que ya estaban en Formalizada no se tocan. Fundamento:
 * docs/legal/estados-formales-y-funciones.md.
 */
export const TRANSITION_REQUIREMENTS: Partial<Record<FormalizationState, readonly DocumentType[]>> =
  {
    [FormalizationState.Formalizada]: [
      DocumentType.Rut,
      DocumentType.ExistenceRepresentationCertificate,
    ],
  };

/**
 * States an organization can never enter on its own (R2-2, SEC-003): being an
 * ESAL — and above all an ESAL with RTE — unlocks tax-relevant capabilities
 * (certificates), so only a platform reviewer moves an org INTO them, citing an
 * approved document. Moving DOWN out of them stays with the org's Owner.
 */
export const PLATFORM_ONLY_STATES: readonly FormalizationState[] = [
  FormalizationState.ESAL,
  FormalizationState.ESAL_RTE,
];

/**
 * Qué documento puede citar la plataforma como evidencia para subir a cada
 * estado: la ESAL se prueba con el certificado de Cámara (dice "sin ánimo de
 * lucro") y el RTE con el RUT (responsabilidad 04). Mismo origen que
 * TRANSITION_REQUIREMENTS. TODO(client): confirmar con el contador si para el
 * RTE también se pide la constancia de calificación de la DIAN.
 */
export const PLATFORM_TRANSITION_EVIDENCE: Partial<
  Record<FormalizationState, readonly DocumentType[]>
> = {
  [FormalizationState.ESAL]: [DocumentType.ExistenceRepresentationCertificate],
  [FormalizationState.ESAL_RTE]: [DocumentType.Rut],
};

export interface TransitionContext {
  /** Document types currently Approved AND vigente for the org. */
  satisfiedDocuments?: readonly DocumentType[];
  /** Requirements map to consult; defaults to {@link TRANSITION_REQUIREMENTS}.
   *  Overridable so the gate can be unit-tested without a seeded catalog. */
  requirements?: Partial<Record<FormalizationState, readonly DocumentType[]>>;
  /**
   * Current DIAN RTE verification status (S-2/RNF07) — gates ESAL → ESAL_RTE
   * specifically. `undefined` means the caller didn't pass it (existing tests,
   * or transitions that never touch ESAL_RTE) → that specific gate is simply
   * NOT applied, same "absent means ungated" philosophy as the document
   * requirements map above. `FormalizationService` (the only real caller)
   * ALWAYS passes a concrete value in production — never leaves this
   * `undefined` — so a real request can never fall through this default.
   */
  dianStatus?: DianVerificationCheckStatus;
}

function indexOf(state: FormalizationState): number {
  return FORMALIZATION_SEQUENCE.indexOf(state);
}

export function checkTransition(
  from: FormalizationState,
  to: FormalizationState,
  ctx: TransitionContext = {},
): TransitionCheck {
  const i = indexOf(from);
  const j = indexOf(to);
  if (i === -1 || j === -1) {
    return { allowed: false, requiresReason: false, error: 'Unknown formalization state.' };
  }
  if (i === j) {
    return {
      allowed: false,
      requiresReason: false,
      error: `The organization is already in "${to}".`,
    };
  }
  if (j === i + 1) {
    // Forward step — enforce the parametrizable document gate (if any).
    const requirements = ctx.requirements ?? TRANSITION_REQUIREMENTS;
    const required = requirements[to] ?? [];
    if (required.length > 0) {
      const satisfied = new Set(ctx.satisfiedDocuments ?? []);
      const missing = required.filter((type) => !satisfied.has(type));
      if (missing.length > 0) {
        return {
          allowed: false,
          requiresReason: false,
          error:
            `Cannot advance to "${to}": the required documents must be approved and ` +
            `current (vigente) first — missing/expired: ${missing.join(', ')}.`,
        };
      }
    }
    // S-2 (RNF07): the ESAL → ESAL_RTE step ADDITIONALLY requires a confirmed
    // DIAN RTE verification — see TransitionContext.dianStatus's own doc for
    // why `undefined` skips this gate instead of blocking.
    if (
      to === FormalizationState.ESAL_RTE &&
      ctx.dianStatus !== undefined &&
      ctx.dianStatus !== 'verified'
    ) {
      return {
        allowed: false,
        requiresReason: false,
        error:
          `Cannot advance to "ESAL_RTE": the DIAN RTE verification has not been ` +
          `confirmed yet (estado: ${ctx.dianStatus}).`,
      };
    }
    return { allowed: true, kind: 'forward', requiresReason: false };
  }
  if (j === i - 1) {
    return { allowed: true, kind: 'backward', requiresReason: true };
  }
  return {
    allowed: false,
    requiresReason: false,
    error: `Invalid transition from "${from}" to "${to}": only one adjacent step is allowed (no skipping states).`,
  };
}

/** rteVigente is coherent with the state: only ESAL_RTE implies it. */
export function rteVigenteFor(state: FormalizationState): boolean {
  return state === FormalizationState.ESAL_RTE;
}

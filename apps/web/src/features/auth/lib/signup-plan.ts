import { PLAN_KEYS, type PlanKey } from '@adoptafacil/contracts';

/**
 * Plan de pago elegido en la landing antes de registrarse
 * (`/register?plan=crece`). Se recuerda en `sessionStorage` (solo esta
 * pestaña) por si la persona va y vuelve antes de terminar. No cobra nada:
 * al crear la cuenta se abre "Plan y facturación" con ese plan señalado, y el
 * pago lo inicia la organización con Mercado Pago desde ahí.
 */
const KEY = 'af.signupPlan';

export type PaidPlanKey = Exclude<PlanKey, 'free'>;

function isPaidPlan(value: string | null): value is PaidPlanKey {
  return value !== null && value !== 'free' && (PLAN_KEYS as readonly string[]).includes(value);
}

export function readSignupPlan(search: URLSearchParams): PaidPlanKey | null {
  const fromUrl = search.get('plan');
  if (isPaidPlan(fromUrl)) {
    try {
      sessionStorage.setItem(KEY, fromUrl);
    } catch {
      // Sin almacenamiento la URL basta.
    }
    return fromUrl;
  }
  try {
    const stored = sessionStorage.getItem(KEY);
    return isPaidPlan(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function forgetSignupPlan(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nada que limpiar.
  }
}

/** "Plan y facturación" con el plan elegido señalado. */
export function chosenPlanPath(plan: PaidPlanKey): string {
  return `/organizacion/plan?elegir=${plan}`;
}

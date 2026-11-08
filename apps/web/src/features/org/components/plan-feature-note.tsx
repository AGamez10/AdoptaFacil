import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PLAN_CATALOG,
  minimumPlanFor,
  type OrganizationPlanView,
  type PlanCapability,
} from '@adoptafacil/contracts';
import { useApiClient } from '../../../shell/api';

/** `GET /org/plan` (Owner/Administrator). `null` mientras carga o si falla. */
export function useOrgPlan(): OrganizationPlanView | null {
  const client = useApiClient();
  const [plan, setPlan] = useState<OrganizationPlanView | null>(null);
  useEffect(() => {
    let active = true;
    client
      .request<OrganizationPlanView>('/org/plan')
      .then((view) => {
        if (active && view && typeof view.capabilities === 'object' && view.capabilities) {
          setPlan(view);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);
  return plan;
}

/** ¿El plan vigente incluye la función? `true` mientras no se sepa: el
 *  servidor decide igual (`PLAN_REQUIRED`). */
export function planAllows(plan: OrganizationPlanView | null, capability: PlanCapability): boolean {
  return plan ? plan.capabilities[capability] === true : true;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

/**
 * Dice de dónde sale una función de pago, para que nadie crea que es un error
 * verla habilitada: del plan que la incluye, o del Pro gratis de lanzamiento
 * mientras no se cobran planes. Si el plan no la incluye, lleva a los planes.
 */
export function PlanFeatureNote({
  plan,
  capability,
}: {
  plan: OrganizationPlanView | null;
  capability: PlanCapability;
}) {
  if (!plan) return null;
  const required = PLAN_CATALOG[minimumPlanFor(capability)].name;
  let text: string;
  if (!planAllows(plan, capability)) {
    text = `Disponible desde el plan ${required}.`;
  } else if (!plan.enforced) {
    text = `Es del plan ${required}. Por el lanzamiento, hoy todas las organizaciones lo tienen incluido sin costo.`;
  } else if (plan.launchPromoEndsAt) {
    text = `Es del plan ${required}. Lo tienes incluido sin costo por el lanzamiento hasta el ${formatDate(plan.launchPromoEndsAt)}.`;
  } else {
    text = `Incluido en tu plan ${PLAN_CATALOG[plan.effectivePlan].name}.`;
  }
  return (
    <p className="text-xs text-muted-foreground" data-testid={`plan-note-${capability}`}>
      {text}{' '}
      <Link to="/organizacion/plan" className="underline underline-offset-4">
        {planAllows(plan, capability) ? 'Ver mi plan' : 'Ver planes'}
      </Link>
    </p>
  );
}

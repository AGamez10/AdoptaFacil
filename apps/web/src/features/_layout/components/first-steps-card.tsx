import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Role, type Organization, type OrganizationDashboardSummary } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { useFeature } from '../../../shell/capabilities';
import { MERCADOPAGO_CONNECT_HREF } from '../../org/components/payments-connection-status';
import { onlinePaymentsEnabled } from '../../payments/lib/payment-provider';
import { deriveFirstSteps } from '../model/first-steps';

const HIDDEN_KEY = 'adoptafacil.first-steps.hidden';

type Profile = Pick<Organization, 'logoUrl' | 'description' | 'aboutUs'>;

function readHidden(orgId: string): boolean {
  try {
    return window.localStorage.getItem(`${HIDDEN_KEY}.${orgId}`) === '1';
  } catch {
    return false;
  }
}

/**
 * "Primeros pasos" — el dueño o administrador de un refugio que acaba de entrar
 * ve aquí, en orden, lo que tiene que hacer para empezar, con un enlace directo a
 * cada pantalla. Desaparece sola cuando todo está hecho y se puede ocultar antes.
 */
export function FirstStepsCard({ summary }: { summary: OrganizationDashboardSummary }) {
  const client = useApiClient();
  const { hasAnyRole, user } = useSession();
  const paymentsOn = useFeature('payments');
  const canManage = hasAnyRole(Role.Owner, Role.Administrator);
  const orgId = user?.organizationId ?? 'org';
  const checksPayments = canManage && paymentsOn && onlinePaymentsEnabled();

  const [hidden, setHidden] = useState(() => readHidden(orgId));
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [payments, setPayments] = useState<'connected' | 'pending' | null | undefined>(
    checksPayments ? undefined : null,
  );

  useEffect(() => {
    if (!canManage || hidden) return undefined;
    let active = true;
    client
      .request<Profile | null>('/org/profile')
      .then((data) => active && setProfile(data && typeof data === 'object' ? data : null))
      .catch(() => active && setProfile(null));
    return () => {
      active = false;
    };
  }, [client, canManage, hidden]);

  useEffect(() => {
    if (!checksPayments || hidden) return undefined;
    let active = true;
    client
      .request<{ connected?: boolean }>('/org/mercadopago/status')
      .then((data) => active && setPayments(data?.connected ? 'connected' : 'pending'))
      // Si el estado no se puede consultar, el paso no se muestra (nunca un error aquí).
      .catch(() => active && setPayments(null));
    return () => {
      active = false;
    };
  }, [client, checksPayments, hidden]);

  if (!canManage || hidden || profile === undefined || payments === undefined) return null;

  const steps = deriveFirstSteps({
    summary,
    profile,
    payments,
    paymentsHref: MERCADOPAGO_CONNECT_HREF,
  });
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;
  const nextKey = steps.find((step) => !step.done)?.key;

  const hide = () => {
    try {
      window.localStorage.setItem(`${HIDDEN_KEY}.${orgId}`, '1');
    } catch {
      // Sin almacenamiento: se oculta solo en esta visita.
    }
    setHidden(true);
  };

  return (
    <Card data-testid="first-steps-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>
              {doneCount} de {steps.length} listos. Con esto tu refugio queda visible y listo para
              recibir adopciones y donaciones.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={hide}>
            Ocultar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Avance de los primeros pasos"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isNext = step.key === nextKey;
            return (
              <li
                key={step.key}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                  isNext ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    step.done
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {step.done ? '✓' : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      step.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {step.title}
                    <span className="sr-only">{step.done ? ' (listo)' : ' (pendiente)'}</span>
                  </p>
                  {!step.done && (
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  )}
                </div>
                {!step.done && (
                  <Link
                    to={step.href}
                    className={cn(
                      'text-sm font-semibold',
                      isNext
                        ? 'rounded-md bg-primary px-3 py-1.5 text-primary-foreground'
                        : 'text-primary',
                    )}
                  >
                    {step.linkLabel}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

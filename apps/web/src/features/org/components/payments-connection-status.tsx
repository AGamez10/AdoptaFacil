import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Role,
  type EpaycoConnectStatusView,
  type MercadoPagoConnectStatusView,
} from '@adoptafacil/contracts';
import { Badge, buttonVariants, Card, CardContent, cn } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { useFeature } from '../../../shell/capabilities';
import {
  isEpaycoProvider,
  isMercadoPagoProvider,
  onlinePaymentsEnabled,
} from '../../payments/lib/payment-provider';
import {
  EPAYCO_PROGRESS_STEPS,
  EPAYCO_TOTAL_PROGRESS_STEPS,
  loadEpaycoDraft,
  progressIndexForStep,
  resumeStep,
  type EpaycoConnectDraft,
} from '../lib/epayco-connect-draft';

/** Destino del botón del aviso: la pestaña "Medios de pago" con el asistente abierto. */
export const EPAYCO_CONNECT_HREF = '/organizacion?tab=pagos&conectar=1';
/** Con Mercado Pago (ADR-PAG-003) se conecta desde la misma pestaña, sin asistente. */
export const MERCADOPAGO_CONNECT_HREF = '/organizacion?tab=pagos';

export function draftProgressLabel(draft: EpaycoConnectDraft): string {
  const index = progressIndexForStep(resumeStep(draft));
  return `Paso ${index + 1} de ${EPAYCO_TOTAL_PROGRESS_STEPS}: ${EPAYCO_PROGRESS_STEPS[index].label}`;
}

export interface PaymentsPendingStatusProps {
  draft: EpaycoConnectDraft | null;
  /** El botón de siguiente paso (un enlace o un botón, según dónde se muestre). */
  action: ReactNode;
  /** Acción secundaria opcional (p. ej. "Empezar de nuevo"). */
  secondary?: ReactNode;
}

/**
 * "Cobros pendientes de conexión" — un ESTADO, no un error: la organización
 * todavía no puede recibir donaciones en línea, todo lo demás funciona, y hay
 * un único siguiente paso claro.
 */
export function PaymentsPendingStatus({ draft, action, secondary }: PaymentsPendingStatusProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4"
      data-testid="payments-pending-status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">Pendiente</Badge>
        <p className="font-semibold text-foreground">Cobros pendientes de conexión</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Aún no puedes recibir donaciones en línea. Todo lo demás de AdoptaFácil funciona normal
        mientras tanto.{' '}
        {isEpaycoProvider()
          ? 'Conectar tu cuenta de ePayco toma unos minutos y te guiamos paso a paso.'
          : 'Conectar tu cuenta de Mercado Pago toma un minuto: autorizas a AdoptaFácil en la página de Mercado Pago, sin compartir contraseñas ni llaves.'}
      </p>
      {draft && (
        <p className="text-sm font-medium text-foreground" data-testid="payments-pending-progress">
          Avance guardado · {draftProgressLabel(draft)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {action}
        {secondary}
      </div>
    </div>
  );
}

/** "Cobros activos": estado tranquilo, sin llamados a la acción. */
export function PaymentsActiveStatus({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1" data-testid="payments-active-status">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Cobros activos</Badge>
        <span className="text-sm text-muted-foreground">
          Las donaciones llegan directo a la cuenta de{' '}
          {isEpaycoProvider() ? 'ePayco' : 'Mercado Pago'} de tu organización.
        </span>
      </div>
      {children}
    </div>
  );
}

export interface PaymentsConnectionBannerProps {
  /** En Inicio no hace falta repetir "Cobros activos" cuando ya todo está bien. */
  hideWhenConnected?: boolean;
}

/**
 * Aviso compacto del estado de cobros para el área de gestión (Inicio y
 * "Donaciones recibidas"). Con la pasarela activa, solo con el módulo de pagos
 * encendido y solo para Owner/Administrator (los únicos que pueden conectar
 * la cuenta). Si el estado no se puede consultar, no muestra nada: nunca un
 * error en una pantalla que no es de pagos.
 */
export function PaymentsConnectionBanner({ hideWhenConnected }: PaymentsConnectionBannerProps) {
  const client = useApiClient();
  const { hasAnyRole, user } = useSession();
  const paymentsOn = useFeature('payments');
  const canManage = hasAnyRole(Role.Owner, Role.Administrator);
  const enabled = paymentsOn && canManage && onlinePaymentsEnabled();
  const mercadopago = isMercadoPagoProvider();
  const orgId = user?.organizationId;
  const [status, setStatus] = useState<'loading' | 'connected' | 'pending' | 'hidden'>('loading');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    client
      .request<EpaycoConnectStatusView | MercadoPagoConnectStatusView>(
        mercadopago ? '/org/mercadopago/status' : '/org/epayco/status',
      )
      .then((data) => {
        if (active) setStatus(data?.connected ? 'connected' : 'pending');
      })
      .catch(() => {
        if (active) setStatus('hidden');
      });
    return () => {
      active = false;
    };
  }, [client, enabled, mercadopago]);

  if (!enabled || status === 'loading' || status === 'hidden') return null;
  if (status === 'connected') {
    if (hideWhenConnected) return null;
    return (
      <div className="mb-4">
        <PaymentsActiveStatus />
      </div>
    );
  }

  const draft = mercadopago ? null : loadEpaycoDraft(orgId);
  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <PaymentsPendingStatus
          draft={draft}
          action={
            <Link
              to={mercadopago ? MERCADOPAGO_CONNECT_HREF : EPAYCO_CONNECT_HREF}
              className={cn(buttonVariants({ size: 'sm' }))}
              data-testid="payments-pending-action"
            >
              {draft ? 'Continuar conexión' : 'Empezar'}
            </Link>
          }
        />
      </CardContent>
    </Card>
  );
}

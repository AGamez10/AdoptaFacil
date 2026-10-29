import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Role, type MercadoPagoConnectStatusView } from '@adoptafacil/contracts';
import { Badge, buttonVariants, Card, CardContent, cn } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { useFeature } from '../../../shell/capabilities';
import { onlinePaymentsEnabled } from '../../payments/lib/payment-provider';

/** ADR-PAG-003: se conecta desde la pestaña "Medios de pago", sin asistente. */
export const MERCADOPAGO_CONNECT_HREF = '/organizacion?tab=pagos';

export interface PaymentsPendingStatusProps {
  /** El botón de siguiente paso (un enlace o un botón, según dónde se muestre). */
  action: ReactNode;
  /** Acción secundaria opcional. */
  secondary?: ReactNode;
}

/**
 * "Cobros pendientes de conexión" — un ESTADO, no un error: la organización
 * todavía no puede recibir donaciones en línea, todo lo demás funciona, y hay
 * un único siguiente paso claro.
 */
export function PaymentsPendingStatus({ action, secondary }: PaymentsPendingStatusProps) {
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
        mientras tanto. Conectar tu cuenta de Mercado Pago toma un minuto: autorizas a AdoptaFácil
        en la página de Mercado Pago, sin compartir contraseñas ni llaves.
      </p>
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
          Las donaciones llegan directo a la cuenta de Mercado Pago de tu organización.
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
  const { hasAnyRole } = useSession();
  const paymentsOn = useFeature('payments');
  const canManage = hasAnyRole(Role.Owner, Role.Administrator);
  const enabled = paymentsOn && canManage && onlinePaymentsEnabled();
  const [status, setStatus] = useState<'loading' | 'connected' | 'pending' | 'hidden'>('loading');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    client
      .request<MercadoPagoConnectStatusView>('/org/mercadopago/status')
      .then((data) => {
        if (active) setStatus(data?.connected ? 'connected' : 'pending');
      })
      .catch(() => {
        if (active) setStatus('hidden');
      });
    return () => {
      active = false;
    };
  }, [client, enabled]);

  if (!enabled || status === 'loading' || status === 'hidden') return null;
  if (status === 'connected') {
    if (hideWhenConnected) return null;
    return (
      <div className="mb-4">
        <PaymentsActiveStatus />
      </div>
    );
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <PaymentsPendingStatus
          action={
            <Link
              to={MERCADOPAGO_CONNECT_HREF}
              className={cn(buttonVariants({ size: 'sm' }))}
              data-testid="payments-pending-action"
            >
              Empezar
            </Link>
          }
        />
      </CardContent>
    </Card>
  );
}

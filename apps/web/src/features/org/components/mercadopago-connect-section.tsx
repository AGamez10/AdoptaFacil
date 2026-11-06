import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MERCADOPAGO_CONNECT_RESULT_PARAM,
  type MercadoPagoConnectResult,
  type MercadoPagoConnectStatusView,
  type MercadoPagoConnectUrlView,
} from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { PaymentsActiveStatus, PaymentsPendingStatus } from './payments-connection-status';

/** RNF: hora Colombia SOLO en presentación (UI); el backend guarda en UTC. */
function formatColombia(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

/** Lo que se le dice a la persona al volver de Mercado Pago. */
const RESULT_TOASTS: Record<
  MercadoPagoConnectResult,
  { title: string; description?: string; variant?: 'destructive' }
> = {
  connected: {
    title: 'Mercado Pago conectado',
    description: 'Ya puedes recibir donaciones en línea.',
  },
  denied: {
    title: 'No se conectó Mercado Pago',
    description: 'Cancelaste la autorización. Puedes intentarlo cuando quieras.',
  },
  expired: {
    title: 'La conexión tardó demasiado',
    description: 'Vuelve a tocar "Conectar Mercado Pago" para empezar de nuevo.',
    variant: 'destructive',
  },
  already_linked: {
    title: 'Esa cuenta ya está conectada a otra organización',
    description: 'Cada organización debe conectar su propia cuenta de Mercado Pago.',
    variant: 'destructive',
  },
  error: {
    title: 'No se pudo conectar Mercado Pago',
    description: 'Inténtalo de nuevo en un momento.',
    variant: 'destructive',
  },
};

function isResult(value: string | null): value is MercadoPagoConnectResult {
  return value !== null && value in RESULT_TOASTS;
}

/**
 * "Conectar Mercado Pago" (ADR-PAG-003) — Owner/Administrator autoriza a
 * AdoptaFácil, por OAuth, a crear cobros en la cuenta de Mercado Pago PROPIA
 * de la organización. Nunca pide ni muestra contraseñas o llaves: Mercado Pago
 * hace la autorización en su propia página y vuelve aquí. El dinero de cada
 * donación llega directo a esa cuenta; AdoptaFácil no lo recibe ni lo retiene.
 *
 * Estados: "Cobros activos" (conectada), "Hay que reconectar" (Mercado Pago
 * dejó de aceptar la autorización; las donaciones quedan en pausa) y
 * "Cobros pendientes de conexión".
 */
export function MercadoPagoConnectSection() {
  const client = useApiClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<MercadoPagoConnectStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const announced = useRef(false);

  const refreshStatus = useCallback(() => {
    setLoading(true);
    client
      .request<MercadoPagoConnectStatusView>('/org/mercadopago/status')
      .then((data) => setStatus(data))
      // Best-effort: una respuesta inesperada muestra el estado pendiente.
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Resultado del regreso desde Mercado Pago (`?mercadopago=…`): un aviso, una vez.
  useEffect(() => {
    const result = searchParams.get(MERCADOPAGO_CONNECT_RESULT_PARAM);
    if (announced.current || !isResult(result)) return;
    announced.current = true;
    toast(RESULT_TOASTS[result]);
    const next = new URLSearchParams(searchParams);
    next.delete(MERCADOPAGO_CONNECT_RESULT_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const connect = async () => {
    setRedirecting(true);
    try {
      const { authorizeUrl } = await client.request<MercadoPagoConnectUrlView>(
        '/org/mercadopago/connect',
      );
      // Navegación completa (nunca un fetch): Mercado Pago pide la autorización
      // en su propia página y vuelve a la API, que nos devuelve aquí.
      window.location.assign(authorizeUrl);
    } catch {
      setRedirecting(false);
      toast({
        title: 'No pudimos abrir Mercado Pago',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await client.request('/org/mercadopago/connect', { method: 'DELETE' });
      setConfirmingDisconnect(false);
      toast({ title: 'Mercado Pago desconectado' });
      refreshStatus();
    } catch {
      toast({
        title: 'No se pudo desconectar',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const connectButton = (label: string) => (
    <Button size="sm" onClick={connect} disabled={redirecting} data-testid="mercadopago-connect">
      {redirecting ? 'Abriendo Mercado Pago…' : label}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mercado Pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Consultando el estado de la conexión…</p>
        ) : status?.connected ? (
          <>
            <PaymentsActiveStatus />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Cuenta conectada</Badge>
              {status.mpUserId && (
                <span className="text-sm text-muted-foreground" data-testid="mercadopago-user-id">
                  Usuario de Mercado Pago: {status.mpUserId}
                </span>
              )}
              {status.liveMode === false && (
                <Badge variant="warning" data-testid="mercadopago-test-mode">
                  Cuenta de prueba
                </Badge>
              )}
            </div>
            {status.connectedAt && (
              <p className="text-xs text-muted-foreground">
                Conectada el {formatColombia(status.connectedAt)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Cada donación se cobra en tu cuenta de Mercado Pago y llega directo a ella.
              AdoptaFácil no recibe ni retiene ese dinero, y no cobra comisión por donación. La
              tarifa de Mercado Pago es la de tu cuenta.
            </p>
            {confirmingDisconnect ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground">
                  ¿Seguro que quieres desconectar Mercado Pago? Dejarás de recibir donaciones en
                  línea hasta que lo conectes de nuevo. Si quieres, también puedes quitar a
                  AdoptaFácil desde tu cuenta de Mercado Pago, en Seguridad → Aplicaciones
                  conectadas.
                </p>
                <Button
                  size="sm"
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={disconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? 'Desconectando…' : 'Sí, desconectar'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={disconnecting}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div>
                <Button variant="outline" size="sm" onClick={() => setConfirmingDisconnect(true)}>
                  Desconectar
                </Button>
              </div>
            )}
          </>
        ) : status?.status === 'needs_reconnect' ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4"
            data-testid="mercadopago-needs-reconnect"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Hay que reconectar</Badge>
              <p className="font-semibold text-foreground">
                Tus donaciones en línea están en pausa
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Mercado Pago dejó de aceptar la autorización de AdoptaFácil (puede pasar si se quitó
              desde tu cuenta o si venció). Vuelve a conectar tu cuenta y todo sigue igual.
            </p>
            <div>{connectButton('Reconectar Mercado Pago')}</div>
          </div>
        ) : (
          <PaymentsPendingStatus draft={null} action={connectButton('Conectar Mercado Pago')} />
        )}
      </CardContent>
    </Card>
  );
}

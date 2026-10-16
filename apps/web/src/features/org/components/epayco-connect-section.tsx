import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EpaycoConnectStatusView } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  clearEpaycoDraft,
  loadEpaycoDraft,
  type EpaycoConnectDraft,
} from '../lib/epayco-connect-draft';
import { EpaycoConnectWizard } from './epayco-connect-wizard';
import { PaymentsActiveStatus, PaymentsPendingStatus } from './payments-connection-status';

/** RNF: hora Colombia SOLO en presentación (UI); el backend guarda en UTC. */
function formatConnectedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

/**
 * "Conectar ePayco" (ADR-PAG-002) — Owner/Administrator conecta la cuenta
 * ePayco PROPIA de la organización. Las donaciones se cobran con esas llaves,
 * así que el dinero llega directo a la cuenta ePayco de la organización
 * (AdoptaFácil nunca lo recibe). Se muestra en lugar de la tarjeta de Mercado
 * Pago cuando `VITE_PAYMENT_PROVIDER=epayco`.
 *
 * Tres estados: "Cobros activos" (conectada), "Cobros pendientes de conexión"
 * (un estado, no un error, con un único siguiente paso y el avance guardado)
 * y el asistente guiado (`EpaycoConnectWizard`), que deja pausar y seguir
 * después. Las llaves secretas solo existen dentro del asistente.
 */
export function EpaycoConnectSection() {
  const client = useApiClient();
  const { toast } = useToast();
  const { user } = useSession();
  const orgId = user?.organizationId;
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<EpaycoConnectStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  // `?conectar=1` (botón "Continuar conexión" de los avisos) abre el asistente directo.
  const [wizardOpen, setWizardOpen] = useState(() => searchParams.get('conectar') === '1');
  const [draft, setDraft] = useState<EpaycoConnectDraft | null>(() => loadEpaycoDraft(orgId));
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(() => {
    setLoading(true);
    client
      .request<EpaycoConnectStatusView>('/org/epayco/status')
      .then((data) => setStatus(data))
      // Best-effort: una respuesta inesperada muestra el estado pendiente.
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const closeWizard = () => {
    setDraft(loadEpaycoDraft(orgId));
    setWizardOpen(false);
  };

  const startOver = () => {
    clearEpaycoDraft(orgId);
    setDraft(null);
    setWizardOpen(true);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await client.request('/org/epayco/connect', { method: 'DELETE' });
      setConfirmingDisconnect(false);
      toast({ title: 'ePayco desconectado' });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>ePayco</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Consultando el estado de la conexión…</p>
        ) : status?.connected ? (
          <>
            <PaymentsActiveStatus />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Cuenta conectada</Badge>
              {status.custId && (
                <span className="text-sm text-muted-foreground" data-testid="epayco-cust-id">
                  P_CUST_ID_CLIENTE: {status.custId}
                </span>
              )}
              {status.publicKeyHint && (
                <span className="text-sm text-muted-foreground" data-testid="epayco-key-hint">
                  PUBLIC_KEY …{status.publicKeyHint}
                </span>
              )}
            </div>
            {status.connectedAt && (
              <p className="text-xs text-muted-foreground">
                Conectada el {formatConnectedAt(status.connectedAt)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              AdoptaFácil no recibe ni retiene ese dinero.
            </p>
            {confirmingDisconnect ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground">
                  ¿Seguro que quieres desconectar la cuenta de ePayco de tu organización? Dejarás de
                  recibir donaciones hasta que la conectes de nuevo.
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
        ) : wizardOpen ? (
          <EpaycoConnectWizard
            orgId={orgId}
            draft={draft}
            onPause={closeWizard}
            onConnected={() => {
              setDraft(null);
              setWizardOpen(false);
              refreshStatus();
            }}
          />
        ) : (
          <PaymentsPendingStatus
            draft={draft}
            action={
              <Button size="sm" onClick={() => setWizardOpen(true)}>
                {draft ? 'Continuar conexión' : 'Empezar'}
              </Button>
            }
            secondary={
              draft ? (
                <Button size="sm" variant="ghost" onClick={startOver}>
                  Empezar de nuevo
                </Button>
              ) : undefined
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

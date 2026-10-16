import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  EPAYCO_CUST_ID_PATTERN,
  type ConnectEpaycoAccountInput,
  type EpaycoConnectStatusView,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';

/** RNF: hora Colombia SOLO en presentación (UI); el backend guarda en UTC. */
function formatConnectedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

const EMPTY_FORM: ConnectEpaycoAccountInput = {
  custId: '',
  pKey: '',
  publicKey: '',
  privateKey: '',
};

interface FieldSpec {
  key: keyof ConnectEpaycoAccountInput;
  label: string;
  hint: string;
  secret: boolean;
}

const FIELDS: FieldSpec[] = [
  {
    key: 'custId',
    label: 'P_CUST_ID_CLIENTE',
    hint: 'El número de cliente de tu cuenta ePayco (solo dígitos).',
    secret: false,
  },
  {
    key: 'pKey',
    label: 'P_KEY',
    hint: 'Llave secreta con la que ePayco firma las confirmaciones de pago.',
    secret: true,
  },
  {
    key: 'publicKey',
    label: 'PUBLIC_KEY',
    hint: 'Llave pública de la API de ePayco.',
    secret: false,
  },
  {
    key: 'privateKey',
    label: 'PRIVATE_KEY',
    hint: 'Llave privada de la API de ePayco.',
    secret: true,
  },
];

/**
 * "Conectar ePayco" (ADR-PAG-002) — Owner/Administrator registra las llaves de
 * la cuenta ePayco PROPIA de la organización. Las donaciones se cobran con esas
 * llaves, así que el dinero llega directo a la cuenta ePayco de la organización
 * (AdoptaFácil nunca lo recibe). Las dos llaves secretas (P_KEY, PRIVATE_KEY)
 * viajan una sola vez por HTTPS, la API las guarda cifradas y nunca las
 * devuelve; este componente las borra de su estado apenas termina el envío.
 * Se muestra en lugar de la tarjeta de Mercado Pago cuando
 * `VITE_PAYMENT_PROVIDER=epayco`.
 */
export function EpaycoConnectSection() {
  const client = useApiClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<EpaycoConnectStatusView | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ConnectEpaycoAccountInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(() => {
    setLoading(true);
    client
      .request<EpaycoConnectStatusView>('/org/epayco/status')
      .then((data) => setStatus(data))
      // Best-effort: una respuesta inesperada solo muestra el formulario.
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const setField = (key: keyof ConnectEpaycoAccountInput) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload: ConnectEpaycoAccountInput = {
      custId: form.custId.trim(),
      pKey: form.pKey.trim(),
      publicKey: form.publicKey.trim(),
      privateKey: form.privateKey.trim(),
    };
    if (!payload.custId || !payload.pKey || !payload.publicKey || !payload.privateKey) {
      setFormError('Completa las cuatro llaves para conectar la cuenta.');
      return;
    }
    if (!EPAYCO_CUST_ID_PATTERN.test(payload.custId)) {
      setFormError('P_CUST_ID_CLIENTE debe contener solo números.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await client.request('/org/epayco/connect', { method: 'PUT', json: payload });
      toast({
        title: 'Cuenta de ePayco conectada',
        description: 'Las donaciones a tu organización llegarán directo a tu cuenta ePayco.',
      });
      refreshStatus();
    } catch {
      toast({
        title: 'No se pudo conectar ePayco',
        description: 'Revisa que las llaves sean las de tu cuenta e inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      // Las llaves secretas nunca se quedan en memoria del componente, ni
      // siquiera si la conexión falló (se vuelven a pegar desde ePayco).
      setForm((prev) => ({ ...prev, pKey: '', privateKey: '' }));
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await client.request('/org/epayco/connect', { method: 'DELETE' });
      setConfirmingDisconnect(false);
      setForm(EMPTY_FORM);
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Cuenta conectada</Badge>
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
              Las donaciones llegan directo a esta cuenta de ePayco. AdoptaFácil no recibe ni
              retiene ese dinero.
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
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit} autoComplete="off" noValidate>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Conecta la cuenta de ePayco de tu organización para recibir donaciones. El dinero
                llega <strong>directo a tu cuenta ePayco</strong>: AdoptaFácil no lo recibe ni lo
                retiene.
              </p>
              <p>
                Encuentras estas llaves en <strong>dashboard.epayco.co</strong> → Integraciones →
                Llaves API. Las llaves secretas (P_KEY y PRIVATE_KEY) se guardan cifradas y no se
                vuelven a mostrar nunca.
              </p>
              <p>
                ¿Tu refugio aún no está formalizado? Puedes abrir una cuenta ePayco como persona
                natural y conectarla aquí.
              </p>
            </div>
            {FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <label htmlFor={`epayco-${field.key}`} className="text-sm font-medium">
                  {field.label}
                </label>
                <Input
                  id={`epayco-${field.key}`}
                  name={`epayco-${field.key}`}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={field.key === 'custId' ? 'numeric' : undefined}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key)(e.target.value)}
                  aria-describedby={`epayco-${field.key}-hint`}
                />
                <p id={`epayco-${field.key}-hint`} className="text-xs text-muted-foreground">
                  {field.hint}
                </p>
              </div>
            ))}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Conectando…' : 'Conectar ePayco'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

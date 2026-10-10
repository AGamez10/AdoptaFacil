import { useState, type FormEvent } from 'react';
import type { MfaEnrollment, MfaStatus } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { workspaceApi } from '../model/workspace-api';
import { workspaceErrorMessage } from '../model/workspace-format';
import { CodeInput } from './code-input';

interface MfaPanelProps {
  status: MfaStatus;
  /** Called once this session passed the second factor. */
  onVerified: () => void;
}

/**
 * Second factor of platform staff (F19). Two cases, explained step by step:
 *   - not set up yet → password again → scan the QR → type the first code;
 *   - set up → type the current code of the app.
 * The API returns a NEW verified token pair, adopted into the session.
 */
export function MfaPanel({ status, onVerified }: MfaPanelProps) {
  const client = useApiClient();
  const { adoptTokens, signOut } = useSession();
  const api = workspaceApi(client);
  const [password, setPassword] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(workspaceErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const startEnrollment = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setEnrollment(await api.startEnrollment(password));
      setPassword('');
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const tokens = enrollment ? await api.confirmEnrollment(code) : await api.verify(code);
      adoptTokens?.(tokens);
      setCode('');
      onVerified();
    });
  };

  const enrolling = !status.enrolled;

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {enrolling ? 'Activa la verificación en dos pasos' : 'Confirma que eres tú'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {enrolling ? (
            <p>
              Las herramientas de plataforma manejan información sensible de las organizaciones. Por
              eso, además de tu contraseña, te pediremos un código de una app de autenticación
              (Google Authenticator, Microsoft Authenticator, Authy o similar) en tu celular.
            </p>
          ) : (
            <p>
              Escribe el código que muestra ahora tu app de autenticación. Lo pedimos al empezar la
              jornada y cada vez que la sesión lleva mucho tiempo sin uso.
            </p>
          )}

          {enrolling && !enrollment && (
            <form onSubmit={startEnrollment} className="space-y-3">
              <p className="font-medium">Paso 1 de 2 · Escribe otra vez tu contraseña</p>
              <div className="space-y-1">
                <label htmlFor="mfa-password" className="text-sm font-medium">
                  Contraseña
                </label>
                <Input
                  id="mfa-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
              </div>
              <Button type="submit" disabled={busy || password.length === 0}>
                Continuar
              </Button>
            </form>
          )}

          {(!enrolling || enrollment) && (
            <form onSubmit={submitCode} className="space-y-3">
              {enrollment && (
                <div className="space-y-2">
                  <p className="font-medium">Paso 2 de 2 · Escanea este código con tu app</p>
                  <img
                    src={enrollment.qrDataUrl}
                    alt="Código QR para agregar AdoptaFácil a tu app de autenticación"
                    className="h-48 w-48 rounded border border-border"
                  />
                  <p className="text-muted-foreground">
                    ¿No puedes escanear? Escribe esta clave en la app:{' '}
                    <code className="break-all font-mono">{enrollment.secret}</code>. Solo se
                    muestra esta vez.
                  </p>
                </div>
              )}
              <CodeInput id="mfa-code" value={code} onChange={setCode} disabled={busy} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>
                  {enrollment ? 'Activar' : 'Confirmar'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => void signOut()}>
                  Cerrar sesión
                </Button>
              </div>
            </form>
          )}

          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {!enrolling && (
            <p className="text-muted-foreground">
              ¿Perdiste el celular? Pide a otra persona líder de tu equipo que solicite el reinicio
              de tu verificación; lo aprueba una tercera persona.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

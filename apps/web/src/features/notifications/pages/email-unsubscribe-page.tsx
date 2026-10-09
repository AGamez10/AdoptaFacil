import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, buttonVariants, Card, CardContent, cn } from '@adoptafacil/ui';
import { PageContainer } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type State = 'idle' | 'sending' | 'done' | 'invalid' | 'error';

/**
 * `/correo/baja?h=…&t=…` — PUBLIC opt-out from bulk emails (Ley 1581 de 2012,
 * revocatoria de la autorización). One explicit click (never on page load, so
 * link scanners in corporate inboxes can't unsubscribe someone by accident).
 * The link carries a hash + signature, never the address. Service emails
 * (receipts, contracts, account security) keep arriving: they are not
 * advertising.
 */
export function EmailUnsubscribePage() {
  const [params] = useSearchParams();
  const h = params.get('h') ?? '';
  const t = params.get('t') ?? '';
  const malformed = !/^[0-9a-f]{64}$/.test(h) || !/^[A-Za-z0-9_-]{43}$/.test(t);
  const [state, setState] = useState<State>(malformed ? 'invalid' : 'idle');

  const confirm = async () => {
    setState('sending');
    try {
      const res = await fetch(`${API_BASE}/public/email/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ h, t }),
      });
      setState(res.ok ? 'done' : res.status === 400 ? 'invalid' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <Card className="mx-auto mt-8 max-w-xl">
            <CardContent className="space-y-4 p-8 text-center">
              <p aria-hidden className="text-4xl">
                {state === 'done' ? '✅' : '📭'}
              </p>
              {state === 'done' ? (
                <>
                  <h1 className="text-2xl font-bold">Listo, no te escribiremos más novedades</h1>
                  <p className="text-muted-foreground">
                    Ya no recibirás correos masivos de AdoptaFácil ni de las organizaciones.
                    Seguirás recibiendo solo lo que tú mismo pidas: comprobantes de donación,
                    contratos y avisos de seguridad de tu cuenta.
                  </p>
                </>
              ) : state === 'invalid' ? (
                <>
                  <h1 className="text-2xl font-bold">Este enlace no es válido</h1>
                  <p className="text-muted-foreground">
                    Revisa que copiaste el enlace completo desde el correo. También puedes usar el
                    botón "Cancelar suscripción" de tu bandeja de entrada.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold">¿Dejar de recibir novedades por correo?</h1>
                  <p className="text-muted-foreground">
                    Dejarás de recibir campañas, anuncios y noticias de las organizaciones. Los
                    correos de tus donaciones, contratos y seguridad de tu cuenta seguirán llegando.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ejerces tu derecho a revocar la autorización (Ley 1581 de 2012).
                  </p>
                  {state === 'error' && (
                    <p role="alert" className="text-sm text-destructive">
                      No pudimos completar la solicitud. Inténtalo de nuevo en un momento.
                    </p>
                  )}
                  <Button onClick={() => void confirm()} disabled={state === 'sending'}>
                    {state === 'sending' ? 'Procesando…' : 'Sí, no quiero recibir más'}
                  </Button>
                </>
              )}
              <div>
                <Link to="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                  Ir a AdoptaFácil
                </Link>
              </div>
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}

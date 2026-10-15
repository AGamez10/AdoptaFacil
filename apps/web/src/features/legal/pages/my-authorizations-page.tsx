import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  currentLegalAcceptanceItems,
  getLegalDocument,
  type LegalDocumentKey,
  type LegalStatus,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { acceptLegalDocuments, fetchLegalStatus, revokeLegalDocument } from '../api/legal-api';
import { legalPath } from '../model/legal-content';

const CHANNEL: Record<string, string> = {
  registration: 'Registro',
  reacceptance: 'Nueva versión',
  guest_donation: 'Donación',
  preferences: 'Preferencias',
};

/** Hora de Colombia solo en presentación; el servidor guarda UTC. */
function formatBogota(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(iso));
}

/** Autorizaciones opcionales que la persona da o retira aquí. */
const OPTIONAL: {
  key: LegalDocumentKey;
  title: string;
  isOn: (s: LegalStatus) => boolean;
  on: string;
  off: string;
  given: string;
  revoked: string;
}[] = [
  {
    key: 'commercial_authorization',
    title: 'Usos comerciales (opcional)',
    isOn: (s) => s.commercialAuthorized,
    on: 'Nos autorizaste a usar tus datos de contacto con fines comerciales.',
    off: 'No has autorizado usos comerciales de tus datos.',
    given: 'Autorización comercial registrada',
    revoked: 'Autorización comercial retirada',
  },
  {
    key: 'ai_training_authorization',
    title: 'Mejora del producto e inteligencia artificial (opcional)',
    isOn: (s) => s.aiTrainingAuthorized,
    on: 'Nos autorizaste a usar tus datos para mejorar el producto y entrenar inteligencia artificial.',
    off: 'Solo usamos información anonimizada o agregada, que no te identifica.',
    given: 'Autorización de IA registrada',
    revoked: 'Autorización de IA retirada',
  },
];

/**
 * `/mis-autorizaciones`: qué documentos aceptó la cuenta, en qué versión y
 * cuándo, y las autorizaciones opcionales que puede dar o retirar.
 */
export function MyAuthorizationsPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLegalStatus(client)
      .then(setStatus)
      .catch(() => setFailed(true));
  }, [client]);

  const toggle = useCallback(
    async (item: (typeof OPTIONAL)[number]) => {
      if (!status) return;
      setSaving(true);
      try {
        const next = item.isOn(status)
          ? await revokeLegalDocument(client, item.key)
          : await acceptLegalDocuments(client, {
              documents: currentLegalAcceptanceItems([item.key]),
            });
        setStatus(next);
        toast({ title: item.isOn(next) ? item.given : item.revoked });
      } catch {
        toast({ title: 'No pudimos guardar el cambio', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    },
    [client, status, toast],
  );

  if (failed) {
    return <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />;
  }
  if (!status) return <Skeleton className="m-6 h-64" />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mis autorizaciones</h1>
        <p className="text-sm text-muted-foreground">
          Lo que aceptaste, en qué versión y cuándo. Guardamos también la IP y el navegador desde
          los que aceptaste, como prueba de tu autorización.
        </p>
      </header>

      {OPTIONAL.map((item) => (
        <Card key={item.key}>
          <CardHeader>
            <CardTitle>{item.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {item.isOn(status) ? item.on : item.off}{' '}
              <Link
                to={legalPath(getLegalDocument(item.key).slug)}
                className="underline underline-offset-2"
              >
                Qué incluye
              </Link>
            </p>
            <Button
              variant="outline"
              disabled={saving}
              data-testid={`toggle-${item.key}`}
              onClick={() => void toggle(item)}
            >
              {item.isOn(status) ? 'Retirar autorización' : 'Autorizar'}
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {status.history.map((h, i) => {
              const doc = getLegalDocument(h.key);
              return (
                <li key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                  <span>
                    {h.action === 'revoked' ? 'Retiraste: ' : 'Aceptaste: '}
                    <Link
                      to={legalPath(doc.slug, h.version)}
                      className="underline underline-offset-2"
                    >
                      {doc.title}
                    </Link>{' '}
                    <span className="text-muted-foreground">(versión {h.version})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatBogota(h.createdAt)} · {CHANNEL[h.channel] ?? h.channel}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Para retirar la autorización de tratamiento de datos o pedir la supresión de tu cuenta,
        escribe a{' '}
        <a href="mailto:adoptafacil.oficial@gmail.com" className="underline underline-offset-2">
          adoptafacil.oficial@gmail.com
        </a>
        . Respondemos consultas en máximo 10 días hábiles y reclamos en máximo 15.
      </p>
    </div>
  );
}

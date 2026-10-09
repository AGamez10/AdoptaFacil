import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  currentLegalAcceptanceItems,
  getLegalDocument,
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

/**
 * `/mis-autorizaciones`: qué documentos aceptó la cuenta, en qué versión y
 * cuándo, y la autorización comercial opcional que puede dar o retirar.
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

  const toggleCommercial = useCallback(async () => {
    if (!status) return;
    setSaving(true);
    try {
      const next = status.commercialAuthorized
        ? await revokeLegalDocument(client, 'commercial_authorization')
        : await acceptLegalDocuments(client, {
            documents: currentLegalAcceptanceItems(['commercial_authorization']),
          });
      setStatus(next);
      toast({
        title: next.commercialAuthorized
          ? 'Autorización comercial registrada'
          : 'Autorización comercial retirada',
      });
    } catch {
      toast({ title: 'No pudimos guardar el cambio', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [client, status, toast]);

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

      <Card>
        <CardHeader>
          <CardTitle>Usos comerciales (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            {status.commercialAuthorized
              ? 'Nos autorizaste a usar tus datos de contacto con fines comerciales.'
              : 'No has autorizado usos comerciales de tus datos.'}{' '}
            <Link
              to={legalPath(getLegalDocument('commercial_authorization').slug)}
              className="underline underline-offset-2"
            >
              Qué incluye
            </Link>
          </p>
          <Button variant="outline" disabled={saving} onClick={() => void toggleCommercial()}>
            {status.commercialAuthorized ? 'Retirar autorización' : 'Autorizar'}
          </Button>
        </CardContent>
      </Card>

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

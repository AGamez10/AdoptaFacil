import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type DecideOrgReportInput,
  type LegalRepresentativeRole,
  type OrgReportPendingSignature,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';

/**
 * `/organizacion/documentos-por-firmar` (M13) — la bandeja de quien firma
 * (representante legal, contador, revisor fiscal). Solo muestra los documentos
 * que le toca firmar: ninguno más de la organización. Firmar es un acto
 * explícito: se revisa el borrador (PDF) y se aprueba o se rechaza con la
 * propia cuenta; la firma que se estampa es la que la persona registró.
 */

const SEAT_LABEL: Record<LegalRepresentativeRole, string> = {
  legal_representative: 'Representante legal',
  fiscal_reviewer: 'Revisor fiscal',
  accountant: 'Contador',
};

const KIND_LABEL = {
  donations: 'Informe de donaciones',
  social_service: 'Reporte de servicio social',
} as const;

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function OrgSigningInboxPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [items, setItems] = useState<OrgReportPendingSignature[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setItems(
        await client.request<OrgReportPendingSignature[]>('/org/reports/pending-signatures'),
      );
    } catch {
      setLoadError(true);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(item: OrgReportPendingSignature) {
    try {
      const blob = await client.requestBlob(`/org/reports/${item.report.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({
        title: 'No se pudo abrir el borrador',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  async function decide(
    item: OrgReportPendingSignature,
    decision: DecideOrgReportInput['decision'],
  ) {
    setBusy(item.report.id);
    try {
      await client.request(`/org/reports/${item.report.id}/decision`, {
        method: 'POST',
        json: { decision },
      });
      toast({
        title: decision === 'approved' ? 'Documento firmado' : 'Documento rechazado',
        description:
          decision === 'approved'
            ? 'Tu firma quedó ligada a este documento. Se emite cuando firmen todos.'
            : 'El documento no se emitirá; quien lo redactó debe generar uno nuevo.',
        variant: 'success',
      });
      setConfirming(null);
      await load();
    } catch (error) {
      toast({
        title: 'No se pudo registrar tu decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Documentos por firmar"
        description="Revisa cada borrador y apruébalo con tu propia cuenta. Nadie puede firmar por ti."
      />
      {loadError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-6">
            <p className="text-sm text-destructive">No se pudo cargar tu bandeja.</p>
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}
      {!items && !loadError && <Skeleton className="h-32 w-full" />}
      {items && items.length === 0 && (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm text-muted-foreground">
            <p>No tienes documentos pendientes de firma.</p>
            <p>
              ¿Aún no registras tu firma?{' '}
              <Link to="/organizacion/representante-legal" className="underline underline-offset-4">
                Regístrala aquí
              </Link>
              : sin ella no te pueden pedir firmas.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {items?.map((item) => (
          <Card key={item.report.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{KIND_LABEL[item.report.kind]}</CardTitle>
                <Badge variant="warning">Firmas como {SEAT_LABEL[item.role]}</Badge>
              </div>
              <CardDescription>
                Del {formatDay(item.report.periodStart)} al {formatDay(item.report.periodEnd)} ·
                folio <span className="font-mono">{item.report.code}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void review(item)}>
                  Revisar borrador (PDF)
                </Button>
                {confirming === item.report.id ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy === item.report.id}
                      onClick={() => void decide(item, 'approved')}
                    >
                      Sí, firmar este documento
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === item.report.id}
                      onClick={() => setConfirming(null)}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => setConfirming(item.report.id)}>
                      Aprobar y firmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === item.report.id}
                      onClick={() => void decide(item, 'rejected')}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
              </div>
              {confirming === item.report.id && (
                <p className="text-xs text-muted-foreground">
                  Al firmar, tu firma registrada se estampa en este documento y queda ligada a su
                  huella digital. No se puede deshacer.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}

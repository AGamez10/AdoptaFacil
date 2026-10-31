import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Role,
  type GenerateOrgReportInput,
  type LegalRepresentativeRole,
  type OrgReport,
  type OrgReportKind,
  type OrgReportLegalEffect,
  type OrgReportStatus,
  type OrgReportsReadiness,
  type Paginated,
} from '@adoptafacil/contracts';
import {
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient, type ApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { DataExportCard } from '../components/data-export-card';
import { ImpactReportCard } from '../components/impact-report-card';

/**
 * `/organizacion/reportes` (M13) — el dueño del refugio genera en un clic el
 * informe de donaciones o el reporte de servicio social de un período, ya con
 * las firmas que correspondan, y lo descarga en PDF (para firmar, enviar o
 * imprimir) o en Excel (para el contador o el colegio). Cada reporte queda
 * sellado con un folio que cualquiera puede verificar en /verificar.
 *
 * La página nunca decide permisos ni el valor legal: lo muestra tal como lo
 * calcula el servidor (`/org/reports/readiness`), que es la autoridad.
 */

const SIGNER_LABEL: Record<LegalRepresentativeRole, string> = {
  legal_representative: 'Representante legal',
  fiscal_reviewer: 'Revisor fiscal',
  accountant: 'Contador',
};

const EFFECT_UI: Record<
  OrgReportLegalEffect,
  { label: string; variant: BadgeVariant; help: string }
> = {
  certified: {
    label: 'Certificado',
    variant: 'success',
    help: 'Con firmas del representante legal y del revisor fiscal o contador. Sirve como soporte tributario de rendición de cuentas.',
  },
  signed: {
    label: 'Firmado',
    variant: 'info',
    help: 'Con la firma del representante legal. Sirve como soporte formal ante colegios, asamblea o donantes.',
  },
  informative: {
    label: 'Informativo',
    variant: 'warning',
    help: 'Sin firmas ni efecto legal: útil para llevar tus cuentas y compartirlas con tu comunidad.',
  },
};

const STATUS_UI: Record<
  Exclude<OrgReportStatus, 'issued'>,
  { label: string; variant: BadgeVariant }
> = {
  pending_signatures: { label: 'Pendiente de firmas', variant: 'warning' },
  rejected: { label: 'Rechazado', variant: 'destructive' },
};

const KIND_UI: Record<OrgReportKind, { title: string; description: string; short: string }> = {
  donations: {
    title: 'Informe de donaciones',
    description:
      'Todas las donaciones aprobadas del período: quién donó (protegiendo a los anónimos), a qué destino, comisiones y neto recibido.',
    short: 'Donaciones',
  },
  social_service: {
    title: 'Reporte de servicio social',
    description:
      'Horas aprobadas de voluntarios y estudiantes, por institución educativa, con quién ya cumple las horas mínimas.',
    short: 'Servicio social',
  },
};

/** Mismo conjunto que el servidor: solo aquí se ofrecen firmantes. */
const FORMAL_STATES = new Set(['formalizada', 'esal', 'esal_rte']);

type PresetId = 'last_month' | 'this_month' | 'this_year' | 'last_year' | 'custom';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'last_month', label: 'Mes pasado' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'this_year', label: 'Este año' },
  { id: 'last_year', label: 'Año pasado' },
  { id: 'custom', label: 'Otro período' },
];

/** Hoy en Colombia (UTC-5, sin horario de verano), `YYYY-MM-DD`. */
function todayCO(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function presetRange(preset: PresetId, today = todayCO()): { start: string; end: string } {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'this_month':
      return { start: `${y}-${pad(m)}-01`, end: today };
    case 'this_year':
      return { start: `${y}-01-01`, end: today };
    case 'last_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
    case 'last_month':
    default: {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { start: `${py}-${pad(pm)}-01`, end: `${py}-${pad(pm)}-${pad(lastDay)}` };
    }
  }
}

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

function summaryText(report: OrgReport): string {
  const s = report.summary;
  if (report.kind === 'donations') {
    return `${s.rowCount} ${s.rowCount === 1 ? 'donación' : 'donaciones'} · ${money(s.netTotal ?? 0)} neto`;
  }
  return `${s.volunteers ?? s.rowCount} ${s.volunteers === 1 ? 'voluntario' : 'voluntarios'} · ${(s.approvedHours ?? 0).toLocaleString('es-CO')} h`;
}

async function downloadReport(
  client: ApiClient,
  report: Pick<OrgReport, 'id' | 'code'>,
  format: 'pdf' | 'xlsx',
) {
  const blob = await client.requestBlob(`/org/reports/${report.id}/${format}`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${report.code}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Firmantes por defecto (mismo criterio que el servidor). */
function defaultSigners(kind: OrgReportKind, registered: Set<LegalRepresentativeRole>) {
  const roles: LegalRepresentativeRole[] = [];
  if (registered.has('legal_representative')) roles.push('legal_representative');
  if (kind === 'donations') {
    if (registered.has('fiscal_reviewer')) roles.push('fiscal_reviewer');
    else if (registered.has('accountant')) roles.push('accountant');
  }
  return roles;
}

function ReadinessPanel({ readiness }: { readiness: OrgReportsReadiness }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Antes de generar</CardTitle>
        <CardDescription>
          Lo que valdrán tus reportes hoy, según el estado de tu organización y las firmas que
          tienes registradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="Firmas registradas">
          {readiness.signers.map((signer) => (
            <span
              key={signer.role}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            >
              <span aria-hidden>{signer.registered ? '✅' : '⚪'}</span>
              <span className="font-medium">{SIGNER_LABEL[signer.role]}:</span>
              <span className="text-muted-foreground">
                {signer.registered ? signer.fullName : 'sin firma registrada'}
              </span>
            </span>
          ))}
          <Link
            to="/organizacion/representante-legal"
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Gestionar mi firma →
          </Link>
          <Link
            to="/organizacion/firmantes"
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Firmantes y firmas exigidas →
          </Link>
        </div>
        {readiness.nextSteps.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReportCard({
  kind,
  readiness,
  canGenerate,
  onGenerated,
}: {
  kind: OrgReportKind;
  readiness: OrgReportsReadiness;
  canGenerate: boolean;
  onGenerated: (report: OrgReport) => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const ui = KIND_UI[kind];
  const consent = readiness.thirdPartyConsent;
  const registered = useMemo(
    () => new Set(readiness.signers.filter((s) => s.registered).map((s) => s.role)),
    [readiness],
  );
  const effect =
    kind === 'donations' ? readiness.donationsLegalEffect : readiness.socialServiceLegalEffect;
  const formal =
    readiness.signaturesEnabled !== false && FORMAL_STATES.has(readiness.formalizationState);

  const [preset, setPreset] = useState<PresetId>('last_month');
  const [range, setRange] = useState(() => presetRange('last_month'));
  const [studentOnly, setStudentOnly] = useState(true);
  const [school, setSchool] = useState('');
  const [signers, setSigners] = useState<LegalRepresentativeRole[]>(() =>
    defaultSigners(kind, registered),
  );
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null);
  const [last, setLast] = useState<OrgReport | null>(null);

  useEffect(() => setSigners(defaultSigners(kind, registered)), [kind, registered]);

  function choosePreset(id: PresetId) {
    setPreset(id);
    if (id !== 'custom') setRange(presetRange(id));
  }

  function toggleSigner(role: LegalRepresentativeRole) {
    setSigners((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );
  }

  async function generate(format: 'pdf' | 'xlsx') {
    if (!range.start || !range.end || range.start > range.end) {
      toast({
        title: 'Revisa el período',
        description: 'La fecha inicial debe ser anterior a la final.',
        variant: 'warning',
      });
      return;
    }
    setBusy(format);
    try {
      const body: GenerateOrgReportInput = {
        kind,
        periodStart: range.start,
        periodEnd: range.end,
        ...(kind === 'social_service'
          ? {
              filters: {
                studentServiceOnly: studentOnly,
                ...(school ? { schoolName: school } : {}),
              },
            }
          : {}),
        ...(formal ? { signerRoles: signers } : {}),
      };
      const report = await client.request<OrgReport>('/org/reports', {
        method: 'POST',
        json: body,
      });
      setLast(report);
      onGenerated(report);
      await downloadReport(client, report, format);
      toast({
        title:
          report.status && report.status !== 'issued'
            ? 'Borrador listo, falta firmarlo'
            : report.reused
              ? 'Reporte ya existente'
              : 'Reporte listo',
        description:
          report.status && report.status !== 'issued'
            ? `Folio ${report.code}. Tiene valor solo cuando cada firmante lo apruebe con su cuenta; lo que descargaste es un borrador sin firmas.`
            : report.reused
              ? `Nada cambió desde la última vez: se descargó el mismo folio ${report.code}.`
              : `Folio ${report.code}. Quedó guardado en tu historial.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo generar el reporte',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  const effectUi = EFFECT_UI[effect];
  const idPrefix = `report-${kind}`;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{ui.title}</CardTitle>
          <Badge variant={effectUi.variant}>{effectUi.label}</Badge>
        </div>
        <CardDescription>{ui.description}</CardDescription>
        <p className="text-xs text-muted-foreground">{effectUi.help}</p>
        <p className="text-xs text-muted-foreground">
          {kind === 'donations'
            ? 'Solo se identifica a los donantes con cuenta que autorizaron el uso de sus datos; los demás aparecen como "Donante".'
            : 'Solo figuran los voluntarios que autorizaron el uso de sus datos; de los demás se informa cuántos no se incluyen.'}
          {consent
            ? ` Hoy autorizaron ${
                kind === 'donations' ? consent.donors.authorized : consent.volunteers.authorized
              } de ${kind === 'donations' ? consent.donors.total : consent.volunteers.total}.`
            : ''}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Período</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Período del reporte">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={preset === p.id ? 'default' : 'outline'}
                aria-pressed={preset === p.id}
                onClick={() => choosePreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm" htmlFor={`${idPrefix}-start`}>
                <span>Desde</span>
                <Input
                  id={`${idPrefix}-start`}
                  type="date"
                  value={range.start}
                  max={todayCO()}
                  onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm" htmlFor={`${idPrefix}-end`}>
                <span>Hasta</span>
                <Input
                  id={`${idPrefix}-end`}
                  type="date"
                  value={range.end}
                  max={todayCO()}
                  onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                />
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Del {formatDay(range.start)} al {formatDay(range.end)}
            </p>
          )}
        </fieldset>

        {kind === 'social_service' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">¿Para quién es?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={studentOnly}
                onChange={(e) => setStudentOnly(e.target.checked)}
              />
              Solo servicio social estudiantil (mínimo {readiness.studentServiceMinHours} h)
            </label>
            <label className="block space-y-1 text-sm" htmlFor={`${idPrefix}-school`}>
              <span>Institución educativa</span>
              <select
                id={`${idPrefix}-school`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              >
                <option value="">Todas las instituciones</option>
                {readiness.schools.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}

        {formal && registered.size > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Firman el documento</legend>
            {readiness.signers
              .filter((s) => s.registered)
              .map((s) => (
                <label key={s.role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={signers.includes(s.role)}
                    onChange={() => toggleSigner(s.role)}
                  />
                  {s.fullName}{' '}
                  <span className="text-muted-foreground">· {SIGNER_LABEL[s.role]}</span>
                </label>
              ))}
            {!signers.includes('legal_representative') && (
              <p className="text-xs text-amber-700">
                Sin la firma del representante legal el reporte sale como informativo.
              </p>
            )}
          </fieldset>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {canGenerate ? (
            <>
              <Button type="button" onClick={() => generate('pdf')} disabled={busy !== null}>
                {busy === 'pdf' ? 'Generando…' : 'Generar PDF'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => generate('xlsx')}
                disabled={busy !== null}
              >
                {busy === 'xlsx' ? 'Generando…' : 'Descargar Excel'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo el propietario o un administrador pueden generar reportes. Puedes descargar los
              ya generados en el historial.
            </p>
          )}
        </div>
        {last && (
          <p className="text-xs text-muted-foreground" role="status">
            Último: folio <span className="font-mono">{last.code}</span> · {summaryText(last)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function OrgReportsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const { toast } = useToast();
  const canGenerate = hasRole(Role.Owner) || hasRole(Role.Administrator);

  const [readiness, setReadiness] = useState<OrgReportsReadiness | null>(null);
  const [history, setHistory] = useState<OrgReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [ready, list] = await Promise.all([
        client.request<OrgReportsReadiness>('/org/reports/readiness'),
        client.request<Paginated<OrgReport>>('/org/reports?limit=20'),
      ]);
      setReadiness(ready);
      setHistory(list.items);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleGenerated(report: OrgReport) {
    setHistory((current) => [report, ...current.filter((r) => r.id !== report.id)]);
  }

  /** Reenvía a quien falte por firmar un enlace nuevo (el anterior deja de servir). */
  async function handleResend(report: OrgReport) {
    try {
      await client.request(`/org/reports/${report.id}/signature-requests`, { method: 'POST' });
      toast({ title: 'Enlace de firma reenviado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo reenviar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  async function handleDownload(report: OrgReport, format: 'pdf' | 'xlsx') {
    try {
      await downloadReport(client, report, format);
    } catch (error) {
      toast({
        title: 'No se pudo descargar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reportes"
        description="Informes de donaciones y de servicio social listos para firmar, enviar y verificar, en un clic."
      />

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      )}
      {loadError && !loading && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
            <p className="text-sm text-destructive">No se pudieron cargar tus reportes.</p>
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && readiness && (
        <>
          <ReadinessPanel readiness={readiness} />
          <div className="grid gap-4 md:grid-cols-2">
            {(['donations', 'social_service'] as const).map((kind) => (
              <ReportCard
                key={kind}
                kind={kind}
                readiness={readiness}
                canGenerate={canGenerate}
                onGenerated={handleGenerated}
              />
            ))}
          </div>

          {canGenerate && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <ImpactReportCard />
              <DataExportCard />
            </div>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Historial</CardTitle>
              <CardDescription>
                Cada reporte queda sellado con un folio y una huella digital: no se puede alterar y
                cualquiera puede verificarlo en{' '}
                <Link to="/verificar" className="underline underline-offset-4">
                  /verificar
                </Link>
                . Generar de nuevo el mismo período sin cambios devuelve el mismo folio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no has generado reportes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Resumen</TableHead>
                        <TableHead>Folio</TableHead>
                        <TableHead className="text-right">Descargar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>
                            <div className="font-medium">{KIND_UI[report.kind].short}</div>
                            <div className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDay(report.periodStart)} – {formatDay(report.periodEnd)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {report.status && report.status !== 'issued' ? (
                              <Badge variant={STATUS_UI[report.status].variant}>
                                {STATUS_UI[report.status].label}
                              </Badge>
                            ) : (
                              <Badge variant={EFFECT_UI[report.legalEffect].variant}>
                                {EFFECT_UI[report.legalEffect].label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{summaryText(report)}</TableCell>
                          <TableCell>
                            <div className="whitespace-nowrap font-mono text-xs">{report.code}</div>
                            <div className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDateTime(report.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {canGenerate && report.status === 'pending_signatures' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleResend(report)}
                              >
                                Reenviar firma
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleDownload(report, 'pdf')}
                            >
                              PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleDownload(report, 'xlsx')}
                            >
                              Excel
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}

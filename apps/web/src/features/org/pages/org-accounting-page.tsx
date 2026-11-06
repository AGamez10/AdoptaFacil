import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACCOUNTING_DISCLAIMER,
  ACCOUNTING_ENTRY_TYPE_LABEL,
  ACCOUNTING_DESTINATION_LABEL,
  PLAN_REQUIRED_CODE,
  RECONCILIATION_STATUS_LABEL,
  RECONCILIATION_STATUSES,
  Role,
  accountingPeriodLabel,
  type AccountingOverview,
  type AccountingPeriodView,
  type AccountingReconciliation,
  type AccountingSyncResult,
  type AdditionalSignerRole,
  type CloseAccountingPeriodResult,
  type PlanRequiredError,
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
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient, type ApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

/**
 * `/organizacion/contabilidad` — el libro auxiliar de donaciones del refugio,
 * generado solo a partir de lo que confirma Mercado Pago: lo concilia mes a mes
 * contra la cuenta del refugio, lo exporta para el contador y, en los planes
 * pagos, cierra el mes y lo envía a firma del revisor fiscal o contador (que
 * firma sin cuenta). AdoptaFácil prepara; nunca firma ni certifica.
 *
 * La página no decide permisos ni planes: los muestra tal como los calcula el
 * servidor (`features` del resumen y 403 PLAN_REQUIRED), que es la autoridad.
 */

export const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

const SIGNER_ROLE_LABEL: Record<AdditionalSignerRole, string> = {
  fiscal_reviewer: 'Revisor fiscal',
  accountant: 'Contador',
};

const REPORT_STATUS_LABEL = {
  issued: 'Firmado y emitido',
  pending_signatures: 'Esperando firma',
  rejected: 'Rechazado por el firmante',
} as const;

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

/** Texto para la persona y si hace falta mostrar "Ver planes". */
export function accountingErrorMessage(error: unknown): { text: string; needsPlan: boolean } {
  if (ApiError.is(error)) {
    const body = error.details as Partial<PlanRequiredError> | undefined;
    if (error.status === 403 && body?.code === PLAN_REQUIRED_CODE) {
      return {
        text:
          typeof body.message === 'string'
            ? body.message
            : 'Esta función está disponible en un plan pago.',
        needsPlan: true,
      };
    }
    if (error.status === 429) {
      return { text: 'Hiciste varias solicitudes seguidas. Espera un momento.', needsPlan: false };
    }
    if (error.status > 0 && error.status < 500 && error.message) {
      return { text: error.message, needsPlan: false };
    }
  }
  return { text: 'No se pudo completar. Inténtalo de nuevo.', needsPlan: false };
}

async function download(client: ApiClient, path: string, filename: string) {
  const blob = await client.requestBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function PlanNotice({ text }: { text: string }) {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {text}{' '}
      <Link
        to="/organizacion/plan"
        className="font-medium text-primary underline underline-offset-4"
      >
        Ver planes
      </Link>
    </p>
  );
}

function Totals({ view }: { view: AccountingPeriodView }) {
  const t = view.totals;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Donaciones"
        value={money(t.donationsGrossCop)}
        accessory={<span className="text-xs text-muted-foreground">{t.donationCount} pagos</span>}
      />
      <StatCard label="Reembolsos y contracargos" value={money(t.refundsCop + t.chargebacksCop)} />
      <StatCard label="Comisiones de la pasarela" value={money(t.feesCop)} />
      <StatCard label="Neto recibido" value={money(t.netCop)} />
    </div>
  );
}

function LedgerTable({ view }: { view: AccountingPeriodView }) {
  if (view.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay movimientos confirmados por Mercado Pago en este mes.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Movimiento</TableHead>
            <TableHead>Destinación</TableHead>
            <TableHead>Forma de pago</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Comisión</TableHead>
            <TableHead className="text-right">Neto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{e.seq}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(e.occurredAt)}</TableCell>
              <TableCell>
                {ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType]}
                {e.isAdjustment && (
                  <Badge variant="warning" className="ml-2">
                    Ajuste de {accountingPeriodLabel(e.eventPeriod)}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {ACCOUNTING_DESTINATION_LABEL[e.destination]}
                {e.destinationLabel ? `: ${e.destinationLabel}` : ''}
              </TableCell>
              <TableCell>{e.paymentType ?? '—'}</TableCell>
              <TableCell className="text-right">{money(e.grossCop)}</TableCell>
              <TableCell className="text-right">
                {e.feeCop === null ? '—' : money(e.feeCop)}
              </TableCell>
              <TableCell className="text-right">
                {e.netCop === null ? '—' : money(e.netCop)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReconciliationCard({
  period,
  canManage,
  mercadopagoConnected,
  reconciliation,
  onLoaded,
  onReread,
}: {
  period: string;
  canManage: boolean;
  mercadopagoConnected: boolean;
  reconciliation: AccountingReconciliation | null;
  onLoaded: (rec: AccountingReconciliation) => void;
  onReread: () => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<null | 'load' | 'reread'>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setBusy('load');
    setMessage(null);
    try {
      onLoaded(
        await client.request<AccountingReconciliation>(
          `/org/accounting/periods/${period}/reconciliation`,
        ),
      );
    } catch (error) {
      setMessage(accountingErrorMessage(error).text);
    } finally {
      setBusy(null);
    }
  }

  async function reread() {
    setBusy('reread');
    setMessage(null);
    try {
      const result = await client.request<AccountingSyncResult>(
        `/org/accounting/periods/${period}/reread`,
        { method: 'POST' },
      );
      toast({
        title: 'Mercado Pago releído',
        description: `Revisamos ${result.fetched} pagos; ${result.entriesCreated} movimientos nuevos en el libro.`,
        variant: 'success',
      });
      onReread();
      await load();
    } catch (error) {
      setMessage(accountingErrorMessage(error).text);
      setBusy(null);
    }
  }

  const pending = reconciliation?.lines.filter((l) => l.status !== 'matched') ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conciliación con Mercado Pago</CardTitle>
        <CardDescription>
          Compara cada donación del libro con lo que tu cuenta de Mercado Pago dice que pasó.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!mercadopagoConnected && (
          <p className="text-sm text-muted-foreground">
            Conecta tu cuenta de Mercado Pago en{' '}
            <Link to="/organizacion" className="text-primary underline underline-offset-4">
              el perfil de la organización
            </Link>{' '}
            para conciliar.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null || !mercadopagoConnected}
            onClick={() => void load()}
          >
            {busy === 'load' ? 'Conciliando…' : 'Conciliar este mes'}
          </Button>
          {canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null || !mercadopagoConnected}
              onClick={() => void reread()}
            >
              {busy === 'reread' ? 'Releyendo…' : 'Releer Mercado Pago'}
            </Button>
          )}
        </div>
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        {reconciliation && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {reconciliation.balanced ? (
                <Badge variant="success">Todo cuadra</Badge>
              ) : (
                <Badge variant="warning">Hay diferencias por revisar</Badge>
              )}
            </p>
            <ul className="grid grid-cols-2 gap-1 text-sm md:grid-cols-3">
              {RECONCILIATION_STATUSES.map((s) => (
                <li key={s}>
                  {RECONCILIATION_STATUS_LABEL[s]}: <strong>{reconciliation.counts[s]}</strong>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              AdoptaFácil {money(reconciliation.platformTotalCop)} · Mercado Pago{' '}
              {money(reconciliation.gatewayTotalCop)} (comisiones{' '}
              {money(reconciliation.gatewayFeesCop)}, neto {money(reconciliation.gatewayNetCop)})
            </p>
            {pending.length > 0 && (
              <ul className="space-y-2 text-sm">
                {pending.map((line) => (
                  <li key={`${line.status}-${line.reference}`} className="rounded-md border p-2">
                    <span className="font-medium">{RECONCILIATION_STATUS_LABEL[line.status]}</span>{' '}
                    · {line.reference} · {formatDateTime(line.occurredAt)}
                    <br />
                    <span className="text-muted-foreground">{line.hint}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportCard({ period, fullExport }: { period: string; fullExport: boolean }) {
  const client = useApiClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; needsPlan: boolean } | null>(null);

  async function run(format: 'csv' | 'xlsx', detail: 'basic' | 'full') {
    const key = `${format}-${detail}`;
    setBusy(key);
    setMessage(null);
    try {
      await download(
        client,
        `/org/accounting/periods/${period}/export?format=${format}&detail=${detail}`,
        `contabilidad-${period}${detail === 'full' ? '-completo' : ''}.${format}`,
      );
    } catch (error) {
      setMessage(accountingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exportar para tu contador</CardTitle>
        <CardDescription>
          El libro del mes en Excel o CSV. El paquete completo suma conciliación, resumen por
          destinación y forma de pago, y los donantes que autorizaron sus datos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run('xlsx', 'basic')}
          >
            Libro del mes (Excel)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run('csv', 'basic')}
          >
            Libro del mes (CSV)
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() => void run('xlsx', 'full')}
          >
            Paquete completo para el contador
          </Button>
        </div>
        {!fullExport && !message && (
          <p className="text-xs text-muted-foreground">
            El paquete completo está incluido en los planes Crece y Pro.
          </p>
        )}
        {message &&
          (message.needsPlan ? (
            <PlanNotice text={message.text} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {message.text}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

function CloseCard({
  view,
  overview,
  canManage,
  reconciliation,
  onChanged,
}: {
  view: AccountingPeriodView;
  overview: AccountingOverview;
  canManage: boolean;
  reconciliation: AccountingReconciliation | null;
  onChanged: () => void;
}) {
  const client = useApiClient();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [needsAcknowledge, setNeedsAcknowledge] = useState(false);
  const [busy, setBusy] = useState<null | 'close' | 'report' | 'share' | string>(null);
  const [message, setMessage] = useState<{ text: string; needsPlan: boolean } | null>(null);
  const [shareRole, setShareRole] = useState<AdditionalSignerRole | ''>(
    overview.signers[0]?.role ?? '',
  );

  useEffect(() => {
    setNote('');
    setAcknowledge(false);
    setNeedsAcknowledge(false);
    setMessage(null);
  }, [view.period]);

  const isPast = view.period < overview.currentPeriod;
  const unbalanced = needsAcknowledge || (reconciliation ? !reconciliation.balanced : false);

  async function close() {
    setBusy('close');
    setMessage(null);
    try {
      const result = await client.request<CloseAccountingPeriodResult>(
        `/org/accounting/periods/${view.period}/close`,
        {
          method: 'POST',
          json: {
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(acknowledge ? { acknowledgeDiscrepancies: true } : {}),
          },
        },
      );
      toast({
        title: `Cerraste ${accountingPeriodLabel(view.period)}`,
        description: result.report
          ? `El libro ${result.report.code} quedó enviado a firma.`
          : result.reportError
            ? `El mes quedó cerrado, pero el libro para firma no se generó: ${result.reportError}`
            : 'El mes quedó sellado; ya no cambia.',
        variant: result.reportError ? 'warning' : 'success',
      });
      onChanged();
    } catch (error) {
      if (ApiError.is(error) && error.status === 409 && /descuadres/.test(error.message)) {
        setNeedsAcknowledge(true);
      }
      setMessage(accountingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function generateReport() {
    setBusy('report');
    setMessage(null);
    try {
      const report = await client.request<{ code: string }>(
        `/org/accounting/periods/${view.period}/report`,
        { method: 'POST' },
      );
      toast({
        title: 'Libro enviado a firma',
        description: `Folio ${report.code}.`,
        variant: 'success',
      });
      onChanged();
    } catch (error) {
      setMessage(accountingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!shareRole) return;
    setBusy('share');
    setMessage(null);
    try {
      await client.request(`/org/accounting/periods/${view.period}/shares`, {
        method: 'POST',
        json: { signerRole: shareRole },
      });
      toast({
        title: 'Enlace enviado',
        description: `Le enviamos por correo a tu ${SIGNER_ROLE_LABEL[shareRole].toLowerCase()} el acceso a este mes.`,
        variant: 'success',
      });
      onChanged();
    } catch (error) {
      setMessage(accountingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(`revoke-${id}`);
    setMessage(null);
    try {
      await client.request(`/org/accounting/shares/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (error) {
      setMessage(accountingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cierre y firma del revisor fiscal o contador</CardTitle>
        <CardDescription>
          Al cerrar, el mes queda sellado (ya no cambia) y el libro se envía a tu revisor fiscal o
          contador, que lo revisa y firma desde el correo, sin crear cuenta. Lo que llegue después
          entra como ajuste del mes en curso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {view.status === 'closed' && view.close && (
          <div className="space-y-1">
            <p>
              <Badge variant="success">Cerrado</Badge> el {formatDateTime(view.close.closedAt)} ·{' '}
              {view.close.entryCount} movimientos
            </p>
            {view.close.note && <p className="text-muted-foreground">Nota: {view.close.note}</p>}
            <p className="break-all text-xs text-muted-foreground">
              Huella del cierre: {view.close.entriesHash}
            </p>
          </div>
        )}

        {view.report && (
          <p>
            Libro para firma <strong>{view.report.code}</strong>:{' '}
            {REPORT_STATUS_LABEL[view.report.status]}.{' '}
            <Link to="/organizacion/reportes" className="text-primary underline underline-offset-4">
              Ver en Reportes
            </Link>
          </p>
        )}

        {overview.signers.length === 0 ? (
          <p className="text-muted-foreground">
            Aún no tienes revisor fiscal ni contador vinculado.{' '}
            <Link
              to="/organizacion/firmantes"
              className="text-primary underline underline-offset-4"
            >
              Vincúlalo en Firmantes
            </Link>
            : le llega un correo y registra su firma la primera vez que firme, sin cuenta.
          </p>
        ) : (
          <ul className="space-y-1">
            {overview.signers.map((s) => (
              <li key={s.role}>
                {SIGNER_ROLE_LABEL[s.role]}: {s.displayName}{' '}
                <span className="text-muted-foreground">
                  ({s.signatureRegistered ? 'firma registrada' : 'registrará su firma al firmar'})
                </span>
              </li>
            ))}
          </ul>
        )}

        {canManage && view.status === 'open' && isPast && (
          <div className="space-y-3 rounded-md border p-3">
            {!overview.features.close ? (
              <PlanNotice text="Cerrar el mes y enviarlo a firma está incluido en los planes Crece y Pro." />
            ) : (
              <>
                <label className="block space-y-1" htmlFor="close-note">
                  <span>Nota del cierre (opcional)</span>
                  <textarea
                    id="close-note"
                    className="w-full rounded-md border bg-background p-2"
                    maxLength={500}
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                {unbalanced && (
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acknowledge}
                      onChange={(event) => setAcknowledge(event.target.checked)}
                    />
                    <span>
                      La conciliación tiene diferencias y aun así cierro el mes (explícalo en la
                      nota).
                    </span>
                  </label>
                )}
                <Button
                  type="button"
                  disabled={busy !== null || (unbalanced && !acknowledge)}
                  onClick={() => void close()}
                >
                  {busy === 'close' ? 'Cerrando…' : `Cerrar ${accountingPeriodLabel(view.period)}`}
                </Button>
              </>
            )}
          </div>
        )}

        {canManage && view.status === 'open' && !isPast && (
          <p className="text-muted-foreground">
            Este mes aún no termina: podrás cerrarlo a partir del 1 del próximo mes.
          </p>
        )}

        {canManage &&
          view.status === 'closed' &&
          !view.report &&
          overview.features.accountantPackage && (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void generateReport()}
            >
              {busy === 'report' ? 'Generando…' : 'Generar el libro y enviarlo a firma'}
            </Button>
          )}

        {canManage && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">Compartir este mes con tu revisor fiscal o contador</p>
            <p className="text-muted-foreground">
              Recibe por correo un enlace (vence en 30 días) para ver y descargar todo el mes, sin
              cuenta. Puedes revocarlo cuando quieras.
            </p>
            {!overview.features.accountantPackage ? (
              <PlanNotice text="Compartir con tu revisor fiscal o contador está incluido en los planes Crece y Pro." />
            ) : overview.signers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="A quién compartir"
                  className="rounded-md border bg-background p-2"
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as AdditionalSignerRole)}
                >
                  {overview.signers.map((s) => (
                    <option key={s.role} value={s.role}>
                      {SIGNER_ROLE_LABEL[s.role]}: {s.displayName}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null || !shareRole}
                  onClick={() => void share()}
                >
                  {busy === 'share' ? 'Enviando…' : 'Enviar enlace'}
                </Button>
              </div>
            ) : null}
            {(view.shares ?? []).length > 0 && (
              <ul className="space-y-1">
                {(view.shares ?? []).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {SIGNER_ROLE_LABEL[s.signerRole]} {s.signerName} · enviado el{' '}
                      {formatDateTime(s.createdAt)}
                    </span>
                    {s.revokedAt ? (
                      <Badge variant="secondary">Revocado</Badge>
                    ) : new Date(s.expiresAt) < new Date() ? (
                      <Badge variant="secondary">Vencido</Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void revoke(s.id)}
                      >
                        Revocar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {message &&
          (message.needsPlan ? (
            <PlanNotice text={message.text} />
          ) : (
            <p role="alert" className="text-destructive">
              {message.text}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

export function OrgAccountingPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);

  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [view, setView] = useState<AccountingPeriodView | null>(null);
  const [reconciliation, setReconciliation] = useState<AccountingReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    client
      .request<AccountingOverview>('/org/accounting')
      .then((data) => {
        setOverview(data);
        setPeriod((current) => current ?? data.currentPeriod);
      })
      .catch((e: unknown) => setError(accountingErrorMessage(e).text));
  }, [client, version]);

  useEffect(() => {
    if (!period) return;
    setView(null);
    client
      .request<AccountingPeriodView>(`/org/accounting/periods/${period}`)
      .then(setView)
      .catch((e: unknown) => setError(accountingErrorMessage(e).text));
  }, [client, period, version]);

  useEffect(() => setReconciliation(null), [period]);

  const periods = overview
    ? overview.periods.some((p) => p.period === overview.currentPeriod)
      ? overview.periods
      : [
          { period: overview.currentPeriod, status: 'open' as const, entryCount: 0, balanceCop: 0 },
          ...overview.periods,
        ]
    : [];

  return (
    <PageContainer>
      <PageHeader
        title="Contabilidad"
        description="El libro de tus donaciones, conciliado con Mercado Pago, listo para tu contador o revisor fiscal."
      />
      <p className="mb-6 text-xs text-muted-foreground">{ACCOUNTING_DISCLAIMER}</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!overview && !error && <Skeleton className="h-48 w-full" />}

      {overview && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mes contable">
            {periods.map((p) => (
              <Button
                key={p.period}
                type="button"
                size="sm"
                variant={period === p.period ? 'default' : 'outline'}
                aria-pressed={period === p.period}
                onClick={() => setPeriod(p.period)}
              >
                {accountingPeriodLabel(p.period)}
                {p.status === 'closed' ? ' · cerrado' : ''}
              </Button>
            ))}
          </div>

          {!view ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <Totals view={view} />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Libro auxiliar de {accountingPeriodLabel(view.period)}
                  </CardTitle>
                  <CardDescription>
                    Solo lo que Mercado Pago confirmó. No se puede editar: las correcciones entran
                    como un movimiento nuevo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LedgerTable view={view} />
                </CardContent>
              </Card>
              <ReconciliationCard
                period={view.period}
                canManage={canManage}
                mercadopagoConnected={overview.mercadopagoConnected}
                reconciliation={reconciliation}
                onLoaded={setReconciliation}
                onReread={refresh}
              />
              <ExportCard period={view.period} fullExport={overview.features.fullExport} />
              <CloseCard
                view={view}
                overview={overview}
                canManage={canManage}
                reconciliation={reconciliation}
                onChanged={refresh}
              />
            </>
          )}
        </div>
      )}
    </PageContainer>
  );
}

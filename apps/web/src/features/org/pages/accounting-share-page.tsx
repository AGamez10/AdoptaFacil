import { useEffect, useState } from 'react';
import {
  ACCOUNTING_DISCLAIMER,
  ACCOUNTING_DESTINATION_LABEL,
  ACCOUNTING_ENTRY_TYPE_LABEL,
  RECONCILIATION_STATUS_LABEL,
  RECONCILIATION_STATUSES,
  accountingPeriodLabel,
  type AccountingSharePreview,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@adoptafacil/ui';
import { useNoIndex } from '../../../seo/seo';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const ROLE_LABEL = { fiscal_reviewer: 'revisor fiscal', accountant: 'contador' } as const;

const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-CO')}`;

/** El token viaja en el fragmento (#token=…): nunca llega a los registros del servidor. */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

async function failure(response: Response): Promise<Error> {
  const data = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return new Error(typeof data?.message === 'string' ? data.message : 'No se pudo completar.');
}

/**
 * Descarga por enlace sin sesión (`/public/accounting/*`). Compartida por la
 * vista del mes compartido y por la página de firma (paquete del mes).
 */
export async function downloadPublicAccounting(
  path: 'shares/export' | 'signature-package',
  token: string,
  format: 'csv' | 'xlsx',
  filename: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/public/accounting/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, format }),
  });
  if (!response.ok) throw await failure(response);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * `/contabilidad-compartida#token=…` — el revisor fiscal o contador abre el
 * enlace que le envió la organización: ve el mes (libro, totales y
 * conciliación con Mercado Pago) y descarga el paquete completo, sin cuenta.
 * La organización puede revocarlo; vence solo a los 30 días.
 */
export function AccountingSharePage() {
  useNoIndex();
  const [token] = useState(tokenFromHash);
  const [preview, setPreview] = useState<AccountingSharePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null);

  useEffect(() => {
    if (!token) {
      setError('Este enlace está incompleto. Ábrelo de nuevo desde el correo.');
      return;
    }
    fetch(`${API_BASE}/public/accounting/shares/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        setPreview((await response.json()) as AccountingSharePreview);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function get(format: 'csv' | 'xlsx') {
    if (!preview) return;
    setBusy(format);
    setError(null);
    try {
      await downloadPublicAccounting(
        'shares/export',
        token,
        format,
        `contabilidad-${preview.period}.${format}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const t = preview?.totals;
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Contabilidad compartida</h1>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!preview && !error && <Skeleton className="h-48 w-full" />}

      {preview && t && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {preview.organizationName} te compartió {accountingPeriodLabel(preview.period)} como
                su {ROLE_LABEL[preview.signerRole]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {preview.nit ? `NIT ${preview.nit} · ` : ''}
                {preview.status === 'closed' ? (
                  <Badge variant="success">Mes cerrado</Badge>
                ) : (
                  <Badge variant="warning">Mes abierto: puede cambiar</Badge>
                )}
                {preview.report ? ` · Libro para firma ${preview.report.code}` : ''}
              </p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <li>
                  Donaciones ({t.donationCount}): <strong>{money(t.donationsGrossCop)}</strong>
                </li>
                <li>
                  Reembolsos y contracargos:{' '}
                  <strong>{money(t.refundsCop + t.chargebacksCop)}</strong>
                </li>
                <li>
                  Tarifa de Mercado Pago: <strong>{money(t.feesCop)}</strong>
                </li>
                <li>
                  Neto recibido: <strong>{money(t.netCop)}</strong>
                </li>
              </ul>
              <p>
                Conciliación con Mercado Pago:{' '}
                {preview.reconciliation.balanced ? 'todo cuadra' : 'hay diferencias'} (
                {RECONCILIATION_STATUSES.filter((s) => preview.reconciliation.counts[s] > 0)
                  .map(
                    (s) => `${RECONCILIATION_STATUS_LABEL[s]}: ${preview.reconciliation.counts[s]}`,
                  )
                  .join(' · ') || 'sin movimientos'}
                )
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" disabled={busy !== null} onClick={() => void get('xlsx')}>
                  {busy === 'xlsx' ? 'Descargando…' : 'Descargar paquete completo (Excel)'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void get('csv')}
                >
                  Libro en CSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Este enlace vence el {new Date(preview.expiresAt).toLocaleDateString('es-CO')}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Libro auxiliar de donaciones</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {preview.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos en este mes.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Movimiento</TableHead>
                      <TableHead>Destinación</TableHead>
                      <TableHead className="text-right">Bruto</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                      <TableHead className="text-right">Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.seq}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(e.occurredAt).toLocaleDateString('es-CO', {
                            timeZone: 'America/Bogota',
                          })}
                        </TableCell>
                        <TableCell>
                          {ACCOUNTING_ENTRY_TYPE_LABEL[e.entryType]}
                          {e.isAdjustment ? ` (ajuste de ${e.eventPeriod})` : ''}
                        </TableCell>
                        <TableCell>{ACCOUNTING_DESTINATION_LABEL[e.destination]}</TableCell>
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
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{ACCOUNTING_DISCLAIMER}</p>
        </>
      )}
    </main>
  );
}

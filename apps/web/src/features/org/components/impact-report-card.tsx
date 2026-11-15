import { useState } from 'react';
import type { OrganizationPlanView } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { ExportMessage } from './data-export-card';
import { downloadOrgExport, exportErrorMessage } from './org-export-download';
import { PlanFeatureNote, planAllows } from './plan-feature-note';

/** Hoy en Colombia (UTC-5, sin horario de verano), `YYYY-MM-DD`. */
function todayCO(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

type ImpactPeriod = 'this_year' | 'last_year';

export function impactPeriod(
  period: ImpactPeriod,
  today = todayCO(),
): { start: string; end: string } {
  const year = Number(today.slice(0, 4));
  return period === 'this_year'
    ? { start: `${year}-01-01`, end: today }
    : { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
}

/**
 * "Reporte de impacto" (planes Crece y Pro): un PDF con lo que la organización
 * logró en el año, para donantes, empresas y su junta. Solo cifras agregadas:
 * nunca nombres ni datos de contacto de personas (`GET /org/exports/impact-report.pdf`).
 */
export function ImpactReportCard({ plan = null }: { plan?: OrganizationPlanView | null }) {
  const allowed = planAllows(plan, 'impactReport');
  const client = useApiClient();
  const [busy, setBusy] = useState<ImpactPeriod | null>(null);
  const [message, setMessage] = useState<{ text: string; needsPlan: boolean } | null>(null);

  async function download(period: ImpactPeriod) {
    const { start, end } = impactPeriod(period);
    setBusy(period);
    setMessage(null);
    try {
      await downloadOrgExport(
        client,
        `/org/exports/impact-report.pdf?start=${start}&end=${end}`,
        `reporte-de-impacto-${start.slice(0, 4)}.pdf`,
      );
    } catch (error) {
      setMessage(exportErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="impact-report-card">
      <CardHeader>
        <CardTitle className="text-base">Reporte de impacto</CardTitle>
        <CardDescription>
          Un PDF para tus donantes y aliados: animales rescatados, adopciones, atenciones
          veterinarias, donaciones, voluntariado y campañas, con un código QR a tu portal. Solo
          cifras: no muestra nombres ni datos de nadie. Es informativo, no es un certificado de
          donación.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => void download('this_year')} disabled={busy !== null || !allowed}>
          {busy === 'this_year' ? 'Generando…' : 'Descargar este año'}
        </Button>
        <Button
          variant="outline"
          onClick={() => void download('last_year')}
          disabled={busy !== null || !allowed}
        >
          {busy === 'last_year' ? 'Generando…' : 'Descargar el año pasado'}
        </Button>
        <div className="w-full">
          <ExportMessage message={message} />
          <PlanFeatureNote plan={plan} capability="impactReport" />
        </div>
      </CardContent>
    </Card>
  );
}

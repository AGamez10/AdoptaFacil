import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLAN_REQUIRED_CODE, type PlanRequiredError } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@adoptafacil/ui';
import { ApiError, useApiClient } from '../../../shell/api';

function planRequired(error: unknown): PlanRequiredError | null {
  if (!ApiError.is(error) || error.status !== 403) return null;
  const body = error.details as Partial<PlanRequiredError> | undefined;
  return body?.code === PLAN_REQUIRED_CODE ? (body as PlanRequiredError) : null;
}

/**
 * "Exportar tus datos" (planes Crece y Pro): descarga un Excel con los
 * animales, adopciones, donaciones, campañas y voluntariado de la organización.
 * El archivo no lleva datos de contacto de adoptantes, donantes ni voluntarios
 * (lo arma `GET /org/exports/data.xlsx`). Solo Owner y Administrator lo ven.
 */
export function DataExportCard() {
  const client = useApiClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; needsPlan: boolean } | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await client.requestBlob('/org/exports/data.xlsx');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `adoptafacil-datos.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const plan = planRequired(error);
      if (plan) {
        setMessage({ text: plan.message, needsPlan: true });
      } else if (ApiError.is(error) && error.status === 429) {
        setMessage({
          text: 'Ya descargaste varias veces en pocos minutos. Espera un momento y vuelve a intentarlo.',
          needsPlan: false,
        });
      } else {
        setMessage({
          text: 'No se pudo generar el archivo. Inténtalo de nuevo.',
          needsPlan: false,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6" data-testid="data-export-card">
      <CardHeader>
        <CardTitle className="text-base">Exportar tus datos</CardTitle>
        <CardDescription>
          Un Excel con tus animales, adopciones, donaciones, campañas y voluntariado, para tu
          contador, tu junta o tus propios análisis. No incluye correos, teléfonos ni documentos de
          adoptantes, donantes o voluntarios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={() => void download()} disabled={busy}>
          {busy ? 'Generando…' : 'Exportar mis datos'}
        </Button>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message.text}{' '}
            {message.needsPlan && (
              <Link to="/organizacion/plan" className="underline underline-offset-4">
                Ver planes
              </Link>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

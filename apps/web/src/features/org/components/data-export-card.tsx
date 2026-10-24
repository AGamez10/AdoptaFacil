import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { downloadOrgExport, exportErrorMessage } from './org-export-download';

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
      await downloadOrgExport(client, '/org/exports/data.xlsx', 'adoptafacil-datos.xlsx');
    } catch (error) {
      setMessage(exportErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="data-export-card">
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
        <ExportMessage message={message} />
      </CardContent>
    </Card>
  );
}

export function ExportMessage({
  message,
}: {
  message: { text: string; needsPlan: boolean } | null;
}) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {message.text}{' '}
      {message.needsPlan && (
        <Link to="/organizacion/plan" className="underline underline-offset-4">
          Ver planes
        </Link>
      )}
    </p>
  );
}

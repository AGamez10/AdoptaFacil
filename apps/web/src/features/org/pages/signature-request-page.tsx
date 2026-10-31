import { useEffect, useState } from 'react';
import type {
  DecideSignatureRequestInput,
  SignatureRequestDecisionResult,
  SignatureRequestPreview,
} from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { useNoIndex } from '../../../seo/seo';
import { TextField } from '../components/profile-fields';
import { SignaturePad } from '../components/signature-pad';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const ROLE_LABEL: Record<SignatureRequestPreview['role'], string> = {
  legal_representative: 'representante legal',
  fiscal_reviewer: 'revisor fiscal',
  accountant: 'contador',
};

const KIND_LABEL: Record<SignatureRequestPreview['report']['kind'], string> = {
  donations: 'Informe de donaciones',
  social_service: 'Reporte de servicio social',
};

/** El token viaja en el fragmento (#token=…): nunca llega a los registros del servidor. */
function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') ?? '';
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/public/signature-requests/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof data?.message === 'string' ? data.message : 'No se pudo completar.');
  }
  return (await response.json()) as T;
}

/**
 * `/firmar#token=…` — el contador o revisor fiscal abre el enlace del correo,
 * sin cuenta ni contraseña: ve el documento, y lo aprueba o rechaza. La
 * primera vez registra su firma y acepta que la organización la guarde; desde
 * la segunda solo confirma con su número de documento. Cada decisión queda
 * registrada con la huella del documento.
 */
export function SignatureRequestPage() {
  useNoIndex();
  const [token] = useState(tokenFromHash);
  const [preview, setPreview] = useState<SignatureRequestPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignatureRequestDecisionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [documentNumber, setDocumentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Este enlace está incompleto. Ábrelo de nuevo desde el correo.');
      return;
    }
    post<SignatureRequestPreview>('preview', { token })
      .then((data) => {
        setPreview(data);
        setFullName(data.signerName);
        setPosition(data.role === 'fiscal_reviewer' ? 'Revisor fiscal' : 'Contador público');
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function openPdf() {
    const response = await fetch(`${API_BASE}/public/signature-requests/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener');
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const body: DecideSignatureRequestInput = {
      token,
      decision,
      documentNumber: documentNumber.trim(),
      ...(decision === 'approved' ? { consent } : {}),
      ...(decision === 'approved' && preview.needsSignature && signatureBase64
        ? {
            signature: {
              fullName: fullName.trim(),
              documentType: 'cedula_ciudadania',
              position: position.trim(),
              signatureBase64,
              signatureContentType: 'image/png',
            },
          }
        : {}),
    };
    try {
      setResult(await post<SignatureRequestDecisionResult>('decision', body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canApprove =
    consent &&
    documentNumber.trim().length >= 3 &&
    (!preview?.needsSignature || (signatureBase64 && fullName.trim() && position.trim()));

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Solicitud de firma</h1>

      {error && !result && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!preview && !error && <Skeleton className="h-48 w-full" />}

      {result && (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm">
            <p className="text-base font-medium">
              {result.decision === 'approved'
                ? 'Listo: firmaste el documento.'
                : 'Registramos tu rechazo. El documento no se emitirá con tu firma.'}
            </p>
            <p className="text-muted-foreground">
              {result.status === 'issued'
                ? `El documento ${result.code} quedó emitido.`
                : `El documento ${result.code} sigue pendiente de otras firmas.`}
            </p>
          </CardContent>
        </Card>
      )}

      {preview && !result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {preview.organizationName} te pide firmar como {ROLE_LABEL[preview.role]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                {KIND_LABEL[preview.report.kind]} · folio {preview.report.code}
              </p>
              <p className="text-muted-foreground">
                Periodo del {preview.report.periodStart} al {preview.report.periodEnd}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                Huella del documento: {preview.report.contentHash}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void openPdf()}>
                Ver el documento (PDF)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-6">
              {preview.needsSignature && (
                <div className="space-y-3">
                  <p className="text-sm">
                    Es tu primera firma para {preview.organizationName}. Regístrala una vez: se
                    guarda cifrada y solo se usa en lo que tú apruebes.
                  </p>
                  <TextField
                    id="sig-name"
                    label="Nombre completo"
                    value={fullName}
                    onChange={setFullName}
                  />
                  <TextField
                    id="sig-position"
                    label="Cargo"
                    value={position}
                    onChange={setPosition}
                  />
                  <SignaturePad onChange={setSignatureBase64} />
                </div>
              )}
              <TextField
                id="sig-document"
                label="Tu número de cédula"
                value={documentNumber}
                onChange={setDocumentNumber}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1"
                />
                <span>{preview.consentText}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!canApprove || busy}
                  onClick={() => void decide('approved')}
                >
                  {busy ? 'Enviando…' : 'Aprobar y firmar'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={documentNumber.trim().length < 3 || busy}
                  onClick={() => void decide('rejected')}
                >
                  Rechazar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Este enlace sirve una sola vez y vence el{' '}
                {new Date(preview.expiresAt).toLocaleDateString('es-CO')}.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

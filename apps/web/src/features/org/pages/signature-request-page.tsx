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

const PHOTO_MAX_EDGE = 900;
const PHOTO_MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Prepara en el navegador la foto de una firma en papel blanco: la reduce y
 * vuelve transparente el papel, para que viaje liviana (PNG sin metadatos).
 * El servidor igual valida el archivo real y la vuelve a limpiar.
 */
async function prepareSignaturePhoto(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Sube una foto en PNG o JPG.');
  }
  if (file.size > PHOTO_MAX_FILE_BYTES) throw new Error('La foto pesa más de 10 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no pudo procesar la foto.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  const levels: number[] = [];
  for (let i = 0; i < d.length; i += 4)
    levels.push((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000);
  const paper = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 2)];
  const cut = paper * 0.75;
  levels.forEach((level, p) => {
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = 0;
    d[p * 4 + 3] =
      level >= cut ? 0 : Math.min(255, Math.round(((cut - level) * 255) / (cut * 0.5)));
  });
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
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
  const [method, setMethod] = useState<'drawn' | 'photo'>('drawn');
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    setSignatureBase64(null);
    setPhotoError(null);
    if (!file) return;
    try {
      setSignatureBase64(await prepareSignaturePhoto(file));
    } catch (e) {
      setPhotoError((e as Error).message);
    }
  }

  function chooseMethod(next: 'drawn' | 'photo') {
    setMethod(next);
    setSignatureBase64(null);
    setPhotoError(null);
  }

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
              method,
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
                  <div className="flex gap-2" role="group" aria-label="Cómo registrar tu firma">
                    <Button
                      type="button"
                      size="sm"
                      variant={method === 'drawn' ? 'default' : 'outline'}
                      onClick={() => chooseMethod('drawn')}
                    >
                      Dibujar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={method === 'photo' ? 'default' : 'outline'}
                      onClick={() => chooseMethod('photo')}
                    >
                      Subir foto
                    </Button>
                  </div>
                  {method === 'drawn' ? (
                    <SignaturePad onChange={setSignatureBase64} />
                  ) : (
                    <div className="space-y-2">
                      <label className="block space-y-1 text-sm" htmlFor="sig-photo">
                        <span>
                          Foto de tu firma sobre papel blanco, con tinta oscura y buena luz (PNG o
                          JPG)
                        </span>
                        <input
                          id="sig-photo"
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(event) => void onPhoto(event.target.files?.[0])}
                        />
                      </label>
                      {photoError && (
                        <p role="alert" className="text-sm text-destructive">
                          {photoError}
                        </p>
                      )}
                      {signatureBase64 && (
                        <img
                          src={`data:image/png;base64,${signatureBase64}`}
                          alt="Vista previa de tu firma"
                          className="max-h-32 rounded-md border bg-white p-2"
                        />
                      )}
                    </div>
                  )}
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

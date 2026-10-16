import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildOrganizationDonateUrl, type DonationLinkOrg } from '@adoptafacil/contracts';
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  useToast,
} from '@adoptafacil/ui';

/** Tamaño en pantalla y tamaño del PNG descargable (≈ 8,7 cm a 300 ppp: se
 *  imprime nítido en un afiche, un volante o una alcancía). */
const PREVIEW_SIZE = 192;
const PRINT_SIZE = 1024;

export interface DonationQrCardProps {
  /** Subdominio/slug GUARDADOS de la organización (no lo que se está editando). */
  organization: DonationLinkOrg & { name?: string };
  /** Lleva al formulario donde se define el enlace del portal (estado vacío). */
  onConfigureLink?: () => void;
}

/** Origen del app y dominio de portales: los mismos que usa el resto del front. */
export function organizationDonateUrl(organization: DonationLinkOrg): string | null {
  return buildOrganizationDonateUrl(organization, {
    appOrigin: window.location.origin,
    portalBaseDomain: import.meta.env.VITE_PORTAL_BASE_DOMAIN as string | undefined,
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * "QR de donaciones" (ADR-PAG-002 §QR): un QR propio por organización que lleva
 * a su comunidad directo a donarle. Codifica la URL ESTABLE de AdoptaFácil
 * (`buildOrganizationDonateUrl`: `https://<sub>.<dominio>/donar` o
 * `/o/<slug>/donar`), nunca un enlace de la pasarela — un QR ya impreso sigue
 * funcionando si la organización cambia de pasarela o de medios de pago.
 */
export function DonationQrCard({ organization, onConfigureLink }: DonationQrCardProps) {
  const { toast } = useToast();
  const url = organizationDonateUrl(organization);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [printDataUrl, setPrintDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let active = true;
    setPreviewDataUrl(null);
    setPrintDataUrl(null);
    Promise.all([
      QRCode.toDataURL(url, { width: PREVIEW_SIZE, margin: 1, errorCorrectionLevel: 'M' }),
      QRCode.toDataURL(url, { width: PRINT_SIZE, margin: 4, errorCorrectionLevel: 'M' }),
    ])
      .then(([preview, print]) => {
        if (!active) return;
        setPreviewDataUrl(preview);
        setPrintDataUrl(print);
      })
      .catch(() => {
        // Best-effort: sin QR queda el enlace en texto (nunca un QR roto).
      });
    return () => {
      active = false;
    };
  }, [url]);

  const copy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    toast(
      ok
        ? { title: 'Enlace copiado', description: 'Ya puedes pegarlo en tus redes o mensajes.' }
        : {
            title: 'No se pudo copiar el enlace',
            description: 'Selecciónalo y cópialo manualmente.',
            variant: 'destructive',
          },
    );
  };

  const fileLabel = (organization.subdomain || organization.slug || 'organizacion').toLowerCase();

  return (
    <Card data-testid="donation-qr-card">
      <CardHeader>
        <CardTitle>QR de donaciones</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!url ? (
          <div className="flex flex-col items-start gap-3" data-testid="donation-qr-empty">
            <p className="text-sm text-muted-foreground">
              Para tener tu QR de donaciones, primero define el enlace de tu portal (slug o
              subdominio) en los datos institucionales de la organización.
            </p>
            {onConfigureLink && (
              <Button variant="outline" size="sm" onClick={onConfigureLink}>
                Definir el enlace del portal
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className="flex shrink-0 items-center justify-center self-center sm:self-start"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            >
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                  alt={`Código QR para donar${organization.name ? ` a ${organization.name}` : ''}: ${url}`}
                  data-testid="donation-qr-image"
                  className="rounded-sm border border-border bg-white p-1"
                />
              ) : (
                <div
                  aria-hidden
                  className="h-full w-full animate-pulse rounded-sm border border-border bg-muted"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Tu comunidad escanea este código y llega directo a la página para donarle a tu
                organización, con los medios de pago que ofrece la pasarela (tarjeta, PSE, Nequi,
                Daviplata, efectivo, según lo que tenga habilitado tu organización). El dinero llega
                directo a la cuenta de tu organización.
              </p>
              <p
                className="break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
                data-testid="donation-qr-url"
              >
                {url}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={copy}>
                  Copiar enlace
                </Button>
                {printDataUrl ? (
                  <a
                    href={printDataUrl}
                    download={`qr-donaciones-${fileLabel}.png`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    data-testid="donation-qr-download"
                  >
                    Descargar QR (PNG)
                  </a>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Descargar QR (PNG)
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Imprímelo en afiches, volantes o alcancías: el enlace no cambia aunque cambies de
                pasarela o de medios de pago.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

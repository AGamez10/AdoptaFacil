import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, buttonVariants, cn, useToast } from '@adoptafacil/ui';

/** Tamaño en pantalla y del PNG descargable (≈ 8,7 cm a 300 ppp: se imprime
 *  nítido en un afiche, un volante o una alcancía). */
const PREVIEW_SIZE = 192;
const PRINT_SIZE = 1024;

export interface QrSharePanelProps {
  /** URL estable que codifica el QR. */
  url: string;
  /** Texto alternativo de la imagen del QR. */
  alt: string;
  /** Nombre del PNG descargado, sin extensión. */
  fileName: string;
  /** Explicación junto al QR (qué pasa cuando alguien lo escanea). */
  children?: React.ReactNode;
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
 * QR para compartir: vista previa, enlace en texto, copiar y descargar el PNG
 * para imprimir. Se genera en el navegador con `qrcode`; si falla, queda el
 * enlace en texto (nunca un QR roto). Lo usan el QR fijo de la organización y
 * el QR de cada campaña.
 */
export function QrSharePanel({ url, alt, fileName, children }: QrSharePanelProps) {
  const { toast } = useToast();
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [printDataUrl, setPrintDataUrl] = useState<string | null>(null);

  useEffect(() => {
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
        // Best-effort: sin QR queda el enlace en texto.
      });
    return () => {
      active = false;
    };
  }, [url]);

  const copy = async () => {
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

  return (
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
            alt={alt}
            data-testid="qr-share-image"
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
        {children}
        <p
          className="break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
          data-testid="qr-share-url"
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
              download={`${fileName}.png`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              data-testid="qr-share-download"
            >
              Descargar QR (PNG)
            </a>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Descargar QR (PNG)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

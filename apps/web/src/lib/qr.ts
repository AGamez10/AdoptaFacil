import type { QRCodeToDataURLOptions } from 'qrcode';

/**
 * QR como data URL. `qrcode` (~70 KB) se baja solo cuando una pantalla pinta
 * un QR, así no viaja en el paquete inicial de la landing y las páginas públicas.
 */
export function qrDataUrl(text: string, options: QRCodeToDataURLOptions): Promise<string> {
  return import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(text, options));
}

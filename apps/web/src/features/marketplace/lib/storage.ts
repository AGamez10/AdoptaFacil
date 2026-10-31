import type { Product } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/**
 * Foto del producto (M10). Cada producto lleva UNA sola foto, que se sube en
 * un paso (`PUT /marketplace/products/:id/image`): la API la recomprime a WebP
 * liviano, revisa la cuota de espacio del plan y reemplaza la anterior.
 */

/** Coherente con STORAGE_MAX_FILE_MB del backend (T-108). */
export const MAX_UPLOAD_MB = 15;

export const IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Lado mayor con el que se envía la foto: la API la deja en 1200 px, así que
 *  mandar más solo gasta datos móviles del usuario. */
export const CLIENT_MAX_EDGE_PX = 1600;
/** Por debajo de este peso la foto se envía tal cual. */
const CLIENT_RESIZE_ABOVE_BYTES = 1024 * 1024;

/** Valida la foto antes de subirla. Devuelve el error en español o `null`. */
export function validateImageUpload(
  file: File,
  accept: readonly string[] = IMAGE_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Sube una foto en JPG, PNG o WebP.';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `La foto supera el límite de ${maxMb} MB.`;
  }
  return null;
}

/**
 * Achica en el navegador una foto pesada (p. ej. de 12 MB, recién tomada con
 * el celular) antes de enviarla, para que suba rápido con datos móviles. Si el
 * navegador no puede (o la foto ya es liviana), devuelve el archivo original:
 * la API la optimiza de todas formas.
 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  if (
    file.size <= CLIENT_RESIZE_ABOVE_BYTES ||
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined'
  ) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, CLIENT_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], 'producto.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

/** Sube (o reemplaza) la foto del producto y devuelve el producto actualizado. */
export async function uploadProductImage(
  client: ApiClient,
  productId: string,
  file: File,
): Promise<Product> {
  const prepared = await shrinkImageForUpload(file);
  const form = new FormData();
  form.append('file', prepared, prepared.name);
  return client.request<Product>(`/marketplace/products/${encodeURIComponent(productId)}/image`, {
    method: 'PUT',
    body: form,
  });
}

/** La foto principal (la única) de un producto, si tiene. */
export function primaryImageUrl(product: { images: readonly { url: string }[] }): string | null {
  return product.images[0]?.url ?? null;
}

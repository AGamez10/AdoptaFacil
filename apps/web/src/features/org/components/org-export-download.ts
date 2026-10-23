import { PLAN_REQUIRED_CODE, type PlanRequiredError } from '@adoptafacil/contracts';
import { ApiError, type ApiClient } from '../../../shell/api';

/** Descarga autenticada de un archivo de `/org/exports/*` (Excel o PDF). */
export async function downloadOrgExport(
  client: ApiClient,
  path: string,
  filename: string,
): Promise<void> {
  const blob = await client.requestBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Mensaje para la persona cuando la descarga falla; `needsPlan` muestra "Ver planes". */
export function exportErrorMessage(error: unknown): { text: string; needsPlan: boolean } {
  if (ApiError.is(error) && error.status === 403) {
    const body = error.details as Partial<PlanRequiredError> | undefined;
    if (body?.code === PLAN_REQUIRED_CODE && typeof body.message === 'string') {
      return { text: body.message, needsPlan: true };
    }
  }
  if (ApiError.is(error) && error.status === 429) {
    return {
      text: 'Ya descargaste varias veces en pocos minutos. Espera un momento y vuelve a intentarlo.',
      needsPlan: false,
    };
  }
  if (ApiError.is(error) && error.status === 400) {
    return { text: error.message, needsPlan: false };
  }
  return { text: 'No se pudo generar el archivo. Inténtalo de nuevo.', needsPlan: false };
}

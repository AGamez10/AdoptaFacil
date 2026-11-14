import { useFocusParam } from './focus';

export { FOCUS_PARAM } from './focus';

/**
 * Llegar desde un aviso ("Ver →") directo a lo que hay que atender. El
 * desplazamiento y el resaltado los hace `FocusScroller` (montado en el
 * encabezado) sobre el elemento marcado con `data-foco="<id>"`; este hook solo
 * devuelve el id apuntado por `?foco=<id>` para que la pantalla pueda, además,
 * abrir ese elemento (por ejemplo el detalle de una solicitud). `ready` se
 * conserva por compatibilidad: con la lista vacía la pantalla no encuentra el id.
 */
export function useFocusTarget(_ready?: boolean): string | null {
  return useFocusParam();
}

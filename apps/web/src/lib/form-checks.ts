/**
 * Validación de formularios que dice EXACTAMENTE qué falta o qué está mal.
 *
 * Antes cada formulario mostraba un único aviso genérico ("Datos incompletos:
 * fecha, horas y descripción son obligatorios") aunque el problema real fuera
 * otro, y la persona no sabía qué corregir. Cada regla lleva su propio título y
 * mensaje; se muestra la PRIMERA que falla, en el orden del formulario.
 */
export interface FormCheck {
  /** `true` = la regla se cumple. */
  ok: boolean;
  /** Título corto del aviso, p. ej. "Falta la descripción". */
  title: string;
  /** Qué hacer para corregirlo. */
  message: string;
}

export interface FormProblem {
  title: string;
  description: string;
}

export function firstFormProblem(checks: readonly FormCheck[]): FormProblem | null {
  const failed = checks.find((check) => !check.ok);
  return failed ? { title: failed.title, description: failed.message } : null;
}

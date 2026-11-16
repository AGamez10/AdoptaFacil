/**
 * Tope DURO del cuerpo multipart, antes de que multer lo termine de leer en
 * memoria. `STORAGE_MAX_FILE_MB` (máx. 100) se valida después, en cada
 * servicio, con el mensaje claro; sin este tope un archivo enorme se cargaba
 * entero en RAM primero (auditoría run-2 S-04).
 */
export const MULTIPART_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

/** Opciones de multer para las rutas que reciben UN archivo opcional/obligatorio. */
export const SINGLE_FILE_UPLOAD_LIMITS = {
  limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 },
} as const;

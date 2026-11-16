import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MULTIPART_HARD_LIMIT_BYTES, SINGLE_FILE_UPLOAD_LIMITS } from './upload-limits';

/**
 * Auditoría run-2 S-04: una ruta multipart SIN `limits` deja que multer lea
 * un cuerpo de cualquier tamaño en RAM antes de que el servicio lo rechace.
 * Esta guarda falla si alguien agrega un `FileInterceptor(...)` sin tope.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('multipart upload limits', () => {
  it('the shared limit is one file of at most 100 MB (the STORAGE_MAX_FILE_MB ceiling)', () => {
    expect(MULTIPART_HARD_LIMIT_BYTES).toBe(100 * 1024 * 1024);
    expect(SINGLE_FILE_UPLOAD_LIMITS.limits).toEqual({
      fileSize: MULTIPART_HARD_LIMIT_BYTES,
      files: 1,
    });
  });

  it('every FileInterceptor in the API declares a size limit', () => {
    const root = join(__dirname, '..', '..');
    const unbounded: string[] = [];
    for (const file of sources(root)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/FileInterceptor\(([^)]*)\)/g)) {
        if (!/limits|LIMITS/.test(match[1])) {
          unbounded.push(`${relative(root, file)}: ${match[0]}`);
        }
      }
    }
    expect(unbounded).toEqual([]);
  });
});

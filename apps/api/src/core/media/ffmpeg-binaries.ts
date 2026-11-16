import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Qué ffmpeg/ffprobe usar. Primero el configurado (FFMPEG_PATH/FFPROBE_PATH,
 * por defecto el del sistema: la imagen Docker lo instala). Si no existe o no
 * arranca, el que viene con las dependencias de la API
 * (`@ffmpeg-installer/*`, `@ffprobe-installer/*`, un binario por sistema
 * operativo). Así los videos se procesan también en un equipo que corre la API
 * con `pnpm dev` sin haber instalado ffmpeg (antes respondía "Por ahora no
 * podemos procesar videos").
 */
export type MediaTool = 'ffmpeg' | 'ffprobe';

const BUNDLED: Record<MediaTool, string> = {
  ffmpeg: '@ffmpeg-installer/ffmpeg',
  ffprobe: '@ffprobe-installer/ffprobe',
};

/** ¿Arranca este binario? (`-version`, con tope de tiempo). */
export function binaryWorks(bin: string): boolean {
  try {
    return spawnSync(bin, ['-version'], { stdio: 'ignore', timeout: 10_000 }).status === 0;
  } catch {
    return false;
  }
}

/** Ruta del binario incluido en las dependencias, o null si este sistema no tiene uno. */
export function bundledBinary(tool: MediaTool): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(BUNDLED[tool]) as { path?: unknown };
    return typeof mod.path === 'string' && existsSync(mod.path) ? mod.path : null;
  } catch {
    return null;
  }
}

/** El configurado si funciona; si no, el incluido; si tampoco hay, el configurado (fallará con aviso claro). */
export function resolveMediaBinary(
  tool: MediaTool,
  configured: string = tool,
  works: (bin: string) => boolean = binaryWorks,
  bundled: (tool: MediaTool) => string | null = bundledBinary,
): string {
  if (works(configured)) return configured;
  const fallback = bundled(tool);
  return fallback && works(fallback) ? fallback : configured;
}

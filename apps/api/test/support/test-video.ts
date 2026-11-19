import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binaryWorks, resolveMediaBinary } from '../../src/core/media/ffmpeg-binaries';

/** El mismo ffmpeg que usa la API (el del sistema o el incluido en las dependencias). */
const FFMPEG = resolveMediaBinary('ffmpeg', process.env.FFMPEG_PATH ?? 'ffmpeg');
export const HAS_FFMPEG = binaryWorks(FFMPEG);

/** Un video de prueba con audio, hecho con el propio ffmpeg (sin archivos en el repo). */
export function makeTestVideo(seconds: number, size = '1280x960'): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'af-test-video-'));
  const out = join(dir, 'in.mov');
  const run = spawnSync(
    FFMPEG,
    [
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=duration=${seconds}:size=${size}:rate=30`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${seconds}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(`No se pudo crear el video de prueba: ${run.stderr}`);
  const data = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return data;
}

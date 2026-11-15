import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import type { Env } from '../../config/env.validation';

/** Lo que el servidor guarda de un video: MP4 liviano + portada + medidas. */
export interface TranscodedVideo {
  video: Buffer;
  /** WebP de ~1280 px de ancho tomado del primer segundo. */
  poster: Buffer;
  durationSeconds: number;
  width: number;
  height: number;
}

export interface TranscodeLimits {
  maxSeconds: number;
}

/** Error con un mensaje que se le puede mostrar tal cual a quien sube el video. */
export class VideoRejectedError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid' | 'too-long' | 'unavailable' = 'invalid',
  ) {
    super(message);
  }
}

/** Alto máximo del video guardado (720p): se ve bien en celular y pesa poco. */
export const VIDEO_MAX_HEIGHT = 720;
const POSTER_WIDTH = 1280;
/** Tope de tiempo de una conversión: una que se cuelga no ocupa el servidor. */
const TRANSCODE_TIMEOUT_MS = 150_000;
const PROBE_TIMEOUT_MS = 20_000;
/** Conversiones a la vez (cada una usa varios núcleos). */
const MAX_CONCURRENT = 2;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      // Solo la cola: ffmpeg es muy verboso y no hace falta guardarlo todo.
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Comprime los videos de la comunidad con ffmpeg (sharp solo procesa
 * imágenes): MP4 H.264 + AAC, máximo 720p, 30 fps, sin metadatos (quita el
 * GPS) y con `faststart` para que empiece a reproducir antes de bajar todo.
 * También saca la portada. Nada toca el disco fuera de una carpeta temporal
 * que se borra al terminar.
 */
@Injectable()
export class VideoTranscoder {
  private readonly logger = new Logger('VideoTranscoder');
  private readonly ffmpeg: string;
  private readonly ffprobe: string;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(config: ConfigService<Env, true>) {
    this.ffmpeg = config.get('FFMPEG_PATH', { infer: true }) ?? 'ffmpeg';
    this.ffprobe = config.get('FFPROBE_PATH', { infer: true }) ?? 'ffprobe';
  }

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }

  async transcode(input: Buffer, limits: TranscodeLimits): Promise<TranscodedVideo> {
    await this.acquire();
    const dir = await mkdtemp(join(tmpdir(), 'af-video-'));
    try {
      const src = join(dir, 'in');
      const out = join(dir, 'out.mp4');
      const posterJpg = join(dir, 'poster.jpg');
      await writeFile(src, input);

      const probe = await this.probe(src);
      if (probe.seconds > limits.maxSeconds + 0.5) {
        throw new VideoRejectedError(
          `El video dura ${Math.round(probe.seconds)} s. El máximo es ${limits.maxSeconds} s.`,
          'too-long',
        );
      }

      const filters = `scale=-2:'min(${VIDEO_MAX_HEIGHT},ih)',fps=30,format=yuv420p`;
      const encode = await this.exec(
        [
          '-hide_banner',
          '-nostdin',
          '-y',
          '-i',
          src,
          '-t',
          String(limits.maxSeconds + 1),
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-vf',
          filters,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '27',
          '-maxrate',
          '2500k',
          '-bufsize',
          '5000k',
          '-profile:v',
          'main',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-ac',
          '2',
          '-map_metadata',
          '-1',
          '-movflags',
          '+faststart',
          out,
        ],
        TRANSCODE_TIMEOUT_MS,
      );
      if (encode.code !== 0) {
        this.logger.warn(`ffmpeg falló (${encode.code}): ${encode.stderr.slice(-300)}`);
        throw new VideoRejectedError(
          'No pudimos procesar el video. Prueba con uno grabado con la cámara del celular.',
        );
      }

      // Portada: el primer segundo (o el inicio si el video es más corto).
      const at = Math.min(1, Math.max(probe.seconds / 2, 0));
      const frame = await this.exec(
        [
          '-hide_banner',
          '-nostdin',
          '-y',
          '-ss',
          at.toFixed(2),
          '-i',
          out,
          '-frames:v',
          '1',
          posterJpg,
        ],
        PROBE_TIMEOUT_MS,
      );
      if (frame.code !== 0) {
        throw new VideoRejectedError('No pudimos sacar la portada del video.');
      }

      const [video, posterRaw, outProbe] = await Promise.all([
        readFile(out),
        readFile(posterJpg),
        this.probe(out),
      ]);
      const poster = await sharp(posterRaw)
        .resize({ width: POSTER_WIDTH, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return {
        video,
        poster,
        durationSeconds: Math.max(1, Math.round(outProbe.seconds)),
        width: outProbe.width,
        height: outProbe.height,
      };
    } finally {
      this.release();
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async exec(args: string[], timeoutMs: number): Promise<RunResult> {
    try {
      return await run(this.ffmpeg, args, timeoutMs);
    } catch (error) {
      this.logger.error(`No se pudo ejecutar ffmpeg: ${String(error)}`);
      throw new VideoRejectedError(
        'Por ahora no podemos procesar videos. Intenta con una foto o vuelve a probar más tarde.',
        'unavailable',
      );
    }
  }

  /** Duración y medidas del primer video, con ffprobe. */
  private async probe(file: string): Promise<{ seconds: number; width: number; height: number }> {
    let result: RunResult;
    try {
      result = await run(
        this.ffprobe,
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height:format=duration',
          '-of',
          'json',
          file,
        ],
        PROBE_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.error(`No se pudo ejecutar ffprobe: ${String(error)}`);
      throw new VideoRejectedError(
        'Por ahora no podemos procesar videos. Intenta con una foto o vuelve a probar más tarde.',
        'unavailable',
      );
    }
    try {
      const parsed = JSON.parse(result.stdout) as {
        streams?: Array<{ width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const stream = parsed.streams?.[0];
      const seconds = Number(parsed.format?.duration);
      if (result.code !== 0 || !stream?.width || !stream.height || !Number.isFinite(seconds)) {
        throw new Error('sin video');
      }
      return { seconds, width: stream.width, height: stream.height };
    } catch {
      throw new VideoRejectedError(
        'No pudimos leer el video. Grábalo con la cámara del celular e inténtalo de nuevo.',
      );
    }
  }
}

/** Llave de la portada de un video: la misma del video con `.poster.webp`. */
export function posterKeyFor(videoKey: string): string {
  return `${videoKey.replace(/\.[^./]+$/, '')}.poster.webp`;
}

import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { HAS_FFMPEG, makeTestVideo } from '../../../test/support/test-video';
import { sniffContentType } from '../storage/file-sniff';
import * as binaries from './ffmpeg-binaries';
import { resolveMediaBinary } from './ffmpeg-binaries';
import { VideoRejectedError, VideoTranscoder, posterKeyFor } from './video-transcoder';

const describeIfFfmpeg = HAS_FFMPEG ? describe : describe.skip;

const transcoder = () =>
  new VideoTranscoder(new ConfigService({ FFMPEG_PATH: 'ffmpeg', FFPROBE_PATH: 'ffprobe' }));

describe('posterKeyFor', () => {
  it('keeps the same folder and name, with .poster.webp', () => {
    expect(posterKeyFor('public/abc/123-video.mp4')).toBe('public/abc/123-video.poster.webp');
  });
});

describeIfFfmpeg('VideoTranscoder', () => {
  it('turns a phone-style video into a light MP4 (max 720p) with a WebP poster', async () => {
    const input = makeTestVideo(2);
    const result = await transcoder().transcode(input, { maxSeconds: 60 });
    expect(sniffContentType(result.video)).toBe('video/mp4');
    expect(result.height).toBeLessThanOrEqual(720);
    expect(result.width).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(result.durationSeconds).toBeLessThanOrEqual(3);
    const poster = await sharp(result.poster).metadata();
    expect(poster.format).toBe('webp');
    expect(poster.width).toBeLessThanOrEqual(1280);
  }, 60_000);

  it('rejects a video longer than the limit, with a plain message', async () => {
    const input = makeTestVideo(4);
    await expect(transcoder().transcode(input, { maxSeconds: 2 })).rejects.toThrow(
      /El video dura \d+ s\. El máximo es 2 s\./,
    );
  }, 60_000);

  it('rejects bytes that are not a video', async () => {
    const error = await transcoder()
      .transcode(Buffer.from('esto no es un video'), { maxSeconds: 60 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VideoRejectedError);
  }, 30_000);
});

describe('resolveMediaBinary', () => {
  const bundled = () => '/deps/ffmpeg';

  it('uses the configured ffmpeg when it runs (Docker image)', () => {
    expect(resolveMediaBinary('ffmpeg', 'ffmpeg', () => true, bundled)).toBe('ffmpeg');
  });

  it('falls back to the bundled binary when the system has no ffmpeg (pnpm dev)', () => {
    const works = (bin: string) => bin === '/deps/ffmpeg';
    expect(resolveMediaBinary('ffmpeg', 'ffmpeg', works, bundled)).toBe('/deps/ffmpeg');
  });

  it('keeps the configured one when there is nothing better', () => {
    expect(
      resolveMediaBinary(
        'ffprobe',
        'ffprobe',
        () => false,
        () => null,
      ),
    ).toBe('ffprobe');
  });

  it('the bundled binaries exist and run on this machine', () => {
    for (const tool of ['ffmpeg', 'ffprobe'] as const) {
      const path = binaries.bundledBinary(tool);
      expect(path).toBeTruthy();
      expect(binaries.binaryWorks(path!)).toBe(true);
    }
  });
});

describeIfFfmpeg('VideoTranscoder on a machine without system ffmpeg', () => {
  it('compresses with the bundled binaries instead of saying it cannot', async () => {
    const t = new VideoTranscoder(
      new ConfigService({ FFMPEG_PATH: '/no/existe/ffmpeg', FFPROBE_PATH: '/no/existe/ffprobe' }),
    );
    const result = await t.transcode(makeTestVideo(2), { maxSeconds: 60 });
    expect(sniffContentType(result.video)).toBe('video/mp4');
    expect((await sharp(result.poster).metadata()).format).toBe('webp');
  }, 60_000);
});

describe('VideoTranscoder without any ffmpeg', () => {
  afterEach(() => jest.restoreAllMocks());

  it('says so in plain language instead of crashing', async () => {
    jest
      .spyOn(binaries, 'resolveMediaBinary')
      .mockImplementation((_tool, configured) => configured!);
    const missing = new VideoTranscoder(
      new ConfigService({ FFMPEG_PATH: '/no/existe/ffmpeg', FFPROBE_PATH: '/no/existe/ffprobe' }),
    );
    const error = (await missing
      .transcode(Buffer.from('x'), { maxSeconds: 60 })
      .catch((e: unknown) => e)) as VideoRejectedError;
    expect(error).toBeInstanceOf(VideoRejectedError);
    expect(error.kind).toBe('unavailable');
    expect(error.message).toMatch(/no podemos procesar videos/i);
  });
});

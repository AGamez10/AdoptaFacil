import { mp4DurationSeconds } from './mp4-duration';

/** Builds a box: 4-byte size + 4-char type + payload. */
function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, payload]);
}

function mvhdV0(timescale: number, duration: number): Buffer {
  const p = Buffer.alloc(100);
  p.writeUInt32BE(timescale, 12);
  p.writeUInt32BE(duration, 16);
  return box('mvhd', p);
}

function mvhdV1(timescale: number, duration: number): Buffer {
  const p = Buffer.alloc(112);
  p.writeUInt8(1, 0);
  p.writeUInt32BE(timescale, 20);
  p.writeBigUInt64BE(BigInt(duration), 24);
  return box('mvhd', p);
}

const ftyp = box('ftyp', Buffer.from('isom0000isommp41', 'latin1'));

describe('mp4DurationSeconds', () => {
  it('reads a version 0 mvhd (mp4 from Android)', () => {
    const file = Buffer.concat([
      ftyp,
      box('moov', mvhdV0(1000, 29_500)),
      box('mdat', Buffer.alloc(32)),
    ]);
    expect(mp4DurationSeconds(file)).toBeCloseTo(29.5);
  });

  it('reads a version 1 mvhd (mov from iPhone), with moov after mdat', () => {
    const file = Buffer.concat([
      ftyp,
      box('mdat', Buffer.alloc(64)),
      box('moov', mvhdV1(600, 600 * 45)),
    ]);
    expect(mp4DurationSeconds(file)).toBe(45);
  });

  it('returns null for something that is not an mp4', () => {
    expect(mp4DurationSeconds(Buffer.from('not a video at all, just text'))).toBeNull();
    expect(mp4DurationSeconds(Buffer.alloc(0))).toBeNull();
  });

  it('returns null on a corrupt box size instead of looping', () => {
    const bad = Buffer.from(ftyp);
    bad.writeUInt32BE(4, 0);
    expect(mp4DurationSeconds(bad)).toBeNull();
  });
});

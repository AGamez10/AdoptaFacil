/**
 * Reads the duration of an MP4/QuickTime (.mov) video from its `moov/mvhd` box,
 * without any external tool. Phone cameras record in these containers (Android
 * mp4, iPhone mov). Returns seconds, or null when the file is not a readable
 * MP4/MOV (the caller then rejects it).
 */
export function mp4DurationSeconds(data: Buffer): number | null {
  const moov = findBox(data, 0, data.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(data, moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;
  const p = mvhd.start;
  if (p + 4 > mvhd.end) return null;
  const version = data.readUInt8(p);
  if (version === 1) {
    // version/flags(4) creation(8) modification(8) timescale(4) duration(8)
    if (p + 32 > mvhd.end) return null;
    const timescale = data.readUInt32BE(p + 20);
    const duration = Number(data.readBigUInt64BE(p + 24));
    return timescale > 0 ? duration / timescale : null;
  }
  // version/flags(4) creation(4) modification(4) timescale(4) duration(4)
  if (p + 20 > mvhd.end) return null;
  const timescale = data.readUInt32BE(p + 12);
  const duration = data.readUInt32BE(p + 16);
  return timescale > 0 ? duration / timescale : null;
}

/** Finds the first child box of `type` between `from` and `to`; returns its
 *  payload bounds. Refuses malformed sizes instead of looping. */
function findBox(
  data: Buffer,
  from: number,
  to: number,
  type: string,
): { start: number; end: number } | null {
  let offset = from;
  while (offset + 8 <= to) {
    let size = data.readUInt32BE(offset);
    const boxType = data.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > to) return null;
      size = Number(data.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < header || offset + size > to) return null;
    if (boxType === type) return { start: offset + header, end: offset + size };
    offset += size;
  }
  return null;
}

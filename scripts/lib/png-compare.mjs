/**
 * Minimal PNG decode and compare, in pure Node — no dependency.
 *
 * This exists so the icon render proof works across Chromium builds. Chromium
 * is byte-deterministic for a fixed build, but CI and a developer's machine
 * rarely run the same one, and a byte comparison that silently skips on a
 * version mismatch is a guard that is not there when it matters. Decoding the
 * pixels instead lets the proof run everywhere: anti-aliasing along an edge
 * shifts a handful of pixels a little, whereas the wrong artwork shifts a great
 * many a lot, and those two are easy to tell apart.
 *
 * Only what these icons need: 8-bit, colour type 2 (RGB) or 6 (RGBA),
 * non-interlaced. Anything else throws rather than guessing.
 */
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** @returns {{width:number,height:number,channels:number,data:Buffer}} RGBA-ordered samples. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colourType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (colourType !== 2 && colourType !== 6) throw new Error(`unsupported colour type ${colourType}`);
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');

  const channels = colourType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const x = line[i];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) v = x + paeth(a, b, c);
      else throw new Error(`unknown filter ${filter} on row ${y}`);
      cur[i] = v & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/**
 * Compare two decoded PNGs.
 *
 * `channelTolerance` is how far one sample may move before the pixel counts as
 * different — anti-aliasing along a curve moves edge pixels by a lot, so the
 * threshold is deliberately generous and the verdict rests on HOW MANY pixels
 * moved, not how far.
 */
export function comparePixels(a, b, { channelTolerance = 24 } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return { comparable: false, reason: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const total = a.width * a.height;
  let differing = 0;
  for (let i = 0; i < total; i += 1) {
    const ai = i * a.channels;
    const bi = i * b.channels;
    let delta = 0;
    for (let c = 0; c < 3; c += 1) delta = Math.max(delta, Math.abs(a.data[ai + c] - b.data[bi + c]));
    if (a.channels === 4 && b.channels === 4) {
      delta = Math.max(delta, Math.abs(a.data[ai + 3] - b.data[bi + 3]));
    }
    if (delta > channelTolerance) differing += 1;
  }
  return { comparable: true, total, differing, ratio: differing / total };
}

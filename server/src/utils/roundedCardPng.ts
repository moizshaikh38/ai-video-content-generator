import zlib from 'node:zlib';

/**
 * Dependency-free rounded-rectangle RGBA PNG synthesizer.
 *
 * The export graph needs real image files for overlay inputs; FFmpeg has no
 * rounded-box primitive and drawtext boxes are square. Social-card (and later
 * hook-card) backgrounds are therefore rendered to a PNG at compile time and
 * fed through the normal overlay channel, so preview (CSS borderRadius) and
 * export derive from the same width/height/radius/color values.
 *
 * Format: 8-bit RGBA, filter byte 0 per scanline, zlib deflate. Straight
 * (non-premultiplied) alpha with supersampled edge anti-aliasing (2x2).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid card color: ${hex}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Coverage of a rounded rect at (px, py) using 2x2 supersampling. */
function coverage(x: number, y: number, w: number, h: number, r: number): number {
  let hits = 0;
  for (const ox of [0.25, 0.75]) {
    for (const oy of [0.25, 0.75]) {
      const px = x + ox;
      const py = y + oy;
      // Nearest corner-circle center, clamped to the corner squares.
      const cx = Math.min(Math.max(px, r), w - r);
      const cy = Math.min(Math.max(py, r), h - r);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r * r || (px >= r && px <= w - r) || (py >= r && py <= h - r)) hits++;
    }
  }
  return hits / 4;
}

export function roundedCardPng(width: number, height: number, radius: number, color: string): Buffer {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const r = Math.max(0, Math.min(Math.round(radius), Math.floor(Math.min(w, h) / 2)));
  const [cr, cg, cb] = hexToRgb(color);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const a = r === 0 ? 255 : Math.round(coverage(x, y, w, h, r) * 255);
      const o = row + 1 + x * 4;
      raw[o] = cr;
      raw[o + 1] = cg;
      raw[o + 2] = cb;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Generates the missing PWA apple-touch-icon.png (180x180) deterministically.
// Pure zlib+CRC PNG encoder — no native/image dependencies, offline-safe.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 180, H = 180;
const px = Buffer.alloc(W * H * 3);

// Void plate with azure barcode sigil motif (deterministic brand mark)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    // deep void background with radial vignette
    const dx = x - W / 2, dy = y - H / 2;
    const d = Math.sqrt(dx * dx + dy * dy) / (W / 2);
    const base = Math.max(0, 1 - d * 0.85);
    let r = Math.round(3 + base * 6);
    let g = Math.round(5 + base * 12);
    let b = Math.round(10 + base * 22);
    // azure ring
    if (Math.abs(d - 0.58) < 0.035) { r = 12; g = 198; b = 255; }
    // barcode bars (deterministic scanline pattern)
    const bx = Math.floor(x / 12) % 6;
    if (d < 0.34 && (bx === 0 || bx === 2 || (bx === 4 && y % 24 < 14))) {
      if (y > H * 0.32 && y < H * 0.68) { r = 73; g = 231; b = 255; }
    }
    // crimson notch (bottom-right quadrant)
    if (bx === 5 && d < 0.22 && y > H * 0.5) { r = 168; g = 0; b = 24; }
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('public/apple-touch-icon.png', png);
console.log(`apple-touch-icon.png written (${png.length} bytes, ${W}x${H})`);

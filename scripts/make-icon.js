// Genera el PNG base del icono de SnapX (sin dependencias).
// Uso: node scripts/make-icon.js
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- dibujo ----------
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawIcon(S) {
  const buf = Buffer.alloc(S * S * 4);
  const cx = S / 2;
  const cy = S / 2;
  const radius = S * 0.22; // esquinas redondeadas
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    // alpha blend sobre transparente (el fondo del icono es el propio)
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };
  const insideRoundRect = (x, y) => {
    const h = S / 2 - radius;
    const dx = Math.abs(x - cx) - h;
    const dy = Math.abs(y - cy) - h;
    return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= radius * radius;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!insideRoundRect(x, y)) continue;
      // gradiente diagonal azul -> violeta
      const t = (x / S) * 0.45 + (y / S) * 0.55;
      const r = Math.round(lerp(0x22, 0x63, t));
      const g = Math.round(lerp(0xc5, 0x66, t));
      const b = Math.round(lerp(0xee, 0xf1, t));
      const d = Math.hypot(x - cx, y - cy) / (S / 2);
      if (d > 0.30 - 0.028 && d < 0.30 + 0.028) {
        set(x, y, 255, 255, 255, 255); // anillo
      } else if (d < 0.30 - 0.028) {
        if (d < 0.145) set(x, y, 245, 250, 255, 255);
        else set(x, y, 0x0d, 0x16, 0x2e, 255);
      } else {
        set(x, y, r, g, b, 255);
      }
    }
  }
  // destello dentro del disco claro
  const sparkR = S * 0.035;
  const sx = cx + S * 0.055;
  const sy = cy - S * 0.075;
  for (let y = Math.floor(sy - sparkR); y <= sy + sparkR; y++) {
    for (let x = Math.floor(sx - sparkR); x <= sx + sparkR; x++) {
      if (Math.hypot(x - sx, y - sy) <= sparkR && insideRoundRect(x, y)) {
        set(x, y, 255, 255, 255, 235);
      }
    }
  }
  return buf;
}

const outDir = path.join(here, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [1024, 128]) {
  const png = encodePng(size, size, drawIcon(size));
  const out = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log("escrito", out, png.length, "bytes");
}

// Renders MediaSpec into real files: procedural PNG pictures and manga pages,
// short WAV sketches, Markdown docs. Node only (zlib). No dependencies.

import { deflateSync } from "node:zlib";
import { createRng } from "./rng.ts";
import type { MediaSpec } from "./generate.ts";

export function renderMedia(spec: MediaSpec): Uint8Array {
  switch (spec.kind) {
    case "photo": return photo(spec.seed);
    case "diagram": return diagram(spec.seed, Math.max(2, spec.labels.length));
    case "page": return page(spec.seed, spec.boxes);
    case "audio": return audio(spec.seed);
    case "doc": return new TextEncoder().encode(spec.text);
  }
}

// ---------- PNG ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// channels: 1 = grayscale, 3 = RGB
function encodePng(w: number, h: number, channels: 1 | 3, px: Uint8Array): Uint8Array {
  const raw = new Uint8Array(h * (w * channels + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * channels + 1)] = 0;
    raw.set(px.subarray(y * w * channels, (y + 1) * w * channels), y * (w * channels + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, channels === 3 ? 2 : 0, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// A quiet landscape-ish picture: sky gradient, a sun, layered ridges.
function photo(seed: string): Uint8Array {
  const r = createRng(seed);
  const w = 480, h = 320;
  const px = new Uint8Array(w * h * 3);
  const hue = r.int(0, 359);
  const sun = { x: r.int(60, w - 60), y: r.int(40, 140), rad: r.int(18, 40) };
  const ridges = Array.from({ length: 4 }, (_, i) => ({
    base: h * (0.45 + i * 0.13), amp: r.int(8, 40), f1: 0.004 + r.next() * 0.02, f2: 0.02 + r.next() * 0.04, ph: r.next() * 6.28,
    col: hsl((hue + 180 + i * 12) % 360, 0.25, 0.45 - i * 0.09),
  }));
  for (let y = 0; y < h; y++) {
    const sky = hsl(hue, 0.45, 0.82 - (y / h) * 0.35);
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = sky;
      const dx = x - sun.x, dy = y - sun.y;
      if (dx * dx + dy * dy < sun.rad * sun.rad) c = hsl((hue + 30) % 360, 0.7, 0.9);
      for (const g of ridges) {
        if (y > g.base + Math.sin(x * g.f1 + g.ph) * g.amp + Math.sin(x * g.f2) * g.amp * 0.3) c = g.col;
      }
      const i = (y * w + x) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
  return encodePng(w, h, 3, px);
}

// Boxes connected by lines; the labels live in the artifact's alt text, not in pixels.
function diagram(seed: string, n: number): Uint8Array {
  const r = createRng(seed);
  const w = 480, h = 300;
  const px = new Uint8Array(w * h * 3).fill(250);
  const ink = hsl(r.int(0, 359), 0.5, 0.35);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2];
  };
  const boxes = Array.from({ length: n }, (_, i) => ({ x: 30 + i * Math.floor((w - 60) / n) + r.int(0, 20), y: r.int(40, h - 110), bw: 90, bh: 50 }));
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    const x0 = a.x + a.bw, y0 = a.y + a.bh / 2, x1 = b.x, y1 = b.y + b.bh / 2;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps));
  }
  for (const b of boxes) {
    for (let x = b.x; x <= b.x + b.bw; x++) for (const t of [0, 1]) { set(x, b.y + t); set(x, b.y + b.bh - t); }
    for (let y = b.y; y <= b.y + b.bh; y++) for (const t of [0, 1]) { set(b.x + t, y); set(b.x + b.bw - t, y); }
  }
  return encodePng(w, h, 3, px);
}

// A manga page: white paper, inked panel frames, screentone and a few shapes per panel.
function page(seed: string, boxes: [number, number, number, number][]): Uint8Array {
  const r = createRng(seed);
  const w = 600, h = 900;
  const px = new Uint8Array(w * h).fill(255);
  for (const [bx, by, bw, bh] of boxes) {
    const x0 = Math.round(bx * w), y0 = Math.round(by * h), x1 = Math.round((bx + bw) * w), y1 = Math.round((by + bh) * h);
    const tone = r.int(3, 7);
    const circles = Array.from({ length: r.int(1, 3) }, () => ({ cx: r.int(x0, x1), cy: r.int(y0, y1), rad: r.int(15, Math.max(16, (x1 - x0) / 3)), fill: r.pick([0, 40, 255]) }));
    const horizon = r.int(y0 + (y1 - y0) / 3, y1 - 10);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let v = 255;
        if (y > horizon && (x + y) % tone === 0) v = 90; // screentone
        for (const c of circles) {
          const dx = x - c.cx, dy = y - c.cy, d2 = dx * dx + dy * dy;
          if (d2 < c.rad * c.rad) v = c.fill;
          if (Math.abs(Math.sqrt(d2) - c.rad) < 1.5) v = 0;
        }
        const edge = x - x0 < 4 || x1 - x <= 4 || y - y0 < 4 || y1 - y <= 4;
        px[y * w + x] = edge ? 0 : v;
      }
    }
  }
  return encodePng(w, h, 1, px);
}

// ---------- WAV ----------

// A three-second pentatonic sketch, 8-bit mono.
function audio(seed: string): Uint8Array {
  const r = createRng(seed);
  const rate = 11025, secs = 3, n = rate * secs;
  const scale = [0, 2, 4, 7, 9, 12];
  const root = 196 * Math.pow(2, r.int(0, 7) / 12);
  const notes = Array.from({ length: 12 }, () => root * Math.pow(2, r.pick(scale) / 12));
  const noteLen = n / notes.length;
  const out = new Uint8Array(44 + n);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + n, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, "data"); dv.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / noteLen);
    const tIn = (i - k * noteLen) / rate;
    const env = Math.exp(-tIn * 4);
    const s = Math.sin((2 * Math.PI * notes[k] * i) / rate) * 0.6 + Math.sin((4 * Math.PI * notes[k] * i) / rate) * 0.2;
    out[44 + i] = Math.max(0, Math.min(255, Math.round(128 + s * env * 100)));
  }
  return out;
}

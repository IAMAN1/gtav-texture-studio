const FOURCC = (s) => (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0;
const FOURCC_MAP = { [FOURCC('DXT1')]: 'BC1', [FOURCC('DXT2')]: 'BC2', [FOURCC('DXT3')]: 'BC2', [FOURCC('DXT4')]: 'BC3', [FOURCC('DXT5')]: 'BC3', [FOURCC('ATI1')]: 'BC4', [FOURCC('BC4U')]: 'BC4', [FOURCC('ATI2')]: 'BC5', [FOURCC('BC5U')]: 'BC5' };
const DXGI_MAP = { 71: 'BC1', 72: 'BC1', 74: 'BC2', 75: 'BC2', 77: 'BC3', 78: 'BC3', 80: 'BC4', 81: 'BC4', 83: 'BC5', 84: 'BC5', 98: 'BC7', 99: 'BC7', 28: 'RGBA8', 29: 'RGBA8', 87: 'BGRA8', 91: 'BGRA8', 88: 'BGRX8' };
const MASK_FMT = { RGBA8: { type: 'MASK', bpp: 4, masks: [0xff, 0xff00, 0xff0000, 0xff000000] }, BGRA8: { type: 'MASK', bpp: 4, masks: [0xff0000, 0xff00, 0xff, 0xff000000] }, BGRX8: { type: 'MASK', bpp: 4, masks: [0xff0000, 0xff00, 0xff, 0] } };
const BLOCK_BYTES = { BC1: 8, BC4: 8, BC2: 16, BC3: 16, BC5: 16, BC7: 16 };
const unpack565 = (c) => [(((c >> 11) & 31) * 255) / 31 | 0, (((c >> 5) & 63) * 255) / 63 | 0, ((c & 31) * 255) / 31 | 0, 255];
const pack565 = ([r, g, b]) => ((((r * 31) / 255 + 0.5) & 31) << 11) | ((((g * 63) / 255 + 0.5) & 63) << 5) | (((b * 31) / 255 + 0.5) & 31);
const mix = (a, b, wa, wb) => [0, 1, 2].map((i) => ((a[i] * wa + b[i] * wb) / (wa + wb)) | 0).concat(255);
const shiftOf = (m) => (m ? 31 - Math.clz32(m & -m) : 0);

export function levelSize(fmt, w, h) {
  const bs = BLOCK_BYTES[fmt.type];
  if (bs) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * bs;
  return w * h * fmt.bpp;
}

function colorBlock(u8, o, out, w, h, x0, y0, bc1) {
  const c0 = u8[o] | (u8[o + 1] << 8), c1 = u8[o + 2] | (u8[o + 3] << 8);
  const p = [unpack565(c0), unpack565(c1)];
  if (!bc1 || c0 > c1) { p[2] = mix(p[0], p[1], 2, 1); p[3] = mix(p[0], p[1], 1, 2); }
  else { p[2] = mix(p[0], p[1], 1, 1); p[3] = [0, 0, 0, 0]; }
  const bits = (u8[o + 4] | (u8[o + 5] << 8) | (u8[o + 6] << 16) | (u8[o + 7] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const x = x0 + (i & 3), y = y0 + (i >> 2);
    if (x >= w || y >= h) continue;
    const c = p[(bits >>> (i * 2)) & 3];
    const k = (y * w + x) * 4;
    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2]; out[k + 3] = c[3];
  }
}

function channelBlock(u8, o, out, w, h, x0, y0, ch) {
  const a0 = u8[o], a1 = u8[o + 1], t = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) t.push((((7 - i) * a0 + i * a1) / 7) | 0);
  else { for (let i = 1; i < 5; i++) t.push((((5 - i) * a0 + i * a1) / 5) | 0); t.push(0, 255); }
  const lo = u8[o + 2] | (u8[o + 3] << 8) | (u8[o + 4] << 16), hi = u8[o + 5] | (u8[o + 6] << 8) | (u8[o + 7] << 16);
  for (let i = 0; i < 16; i++) {
    const x = x0 + (i & 3), y = y0 + (i >> 2);
    if (x >= w || y >= h) continue;
    const idx = i < 8 ? (lo >> (3 * i)) & 7 : (hi >> (3 * (i - 8))) & 7;
    out[(y * w + x) * 4 + ch] = t[idx];
  }
}

function explicitAlpha(u8, o, out, w, h, x0, y0) {
  for (let i = 0; i < 16; i++) {
    const x = x0 + (i & 3), y = y0 + (i >> 2);
    if (x >= w || y >= h) continue;
    out[(y * w + x) * 4 + 3] = ((u8[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
  }
}

function forBlocks(w, h, off, size, fn) {
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { fn(off, bx * 4, by * 4); off += size; }
}

export function decodePixels(u8, off, w, h, fmt) {
  const out = new Uint8ClampedArray(w * h * 4);
  switch (fmt.type) {
    case 'BC1': forBlocks(w, h, off, 8, (o, x, y) => colorBlock(u8, o, out, w, h, x, y, true)); break;
    case 'BC2': forBlocks(w, h, off, 16, (o, x, y) => { colorBlock(u8, o + 8, out, w, h, x, y, false); explicitAlpha(u8, o, out, w, h, x, y); }); break;
    case 'BC3': forBlocks(w, h, off, 16, (o, x, y) => { colorBlock(u8, o + 8, out, w, h, x, y, false); channelBlock(u8, o, out, w, h, x, y, 3); }); break;
    case 'BC4': forBlocks(w, h, off, 8, (o, x, y) => channelBlock(u8, o, out, w, h, x, y, 0)); for (let i = 0; i < out.length; i += 4) { out[i + 1] = out[i + 2] = out[i]; out[i + 3] = 255; } break;
    case 'BC5': forBlocks(w, h, off, 16, (o, x, y) => { channelBlock(u8, o, out, w, h, x, y, 0); channelBlock(u8, o + 8, out, w, h, x, y, 1); }); for (let i = 0; i < out.length; i += 4) { const nx = out[i] / 127.5 - 1, ny = out[i + 1] / 127.5 - 1; out[i + 2] = (Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5 + 0.5) * 255; out[i + 3] = 255; } break;
    case 'BC7': throw new Error('BC7 ยังไม่รองรับ');
    case 'MASK': {
      const { bpp, masks, lum } = fmt; const shifts = masks.map(shiftOf);
      for (let p = 0; p < w * h; p++) {
        let v = 0; for (let b = 0; b < bpp; b++) v |= u8[off + p * bpp + b] << (8 * b);
        v >>>= 0;
        for (let c = 0; c < 4; c++) { const m = masks[c] >>> 0; out[p * 4 + c] = m ? (((v & m) >>> shifts[c]) * 255) / (m >>> shifts[c]) : c === 3 ? 255 : 0; }
        if (lum) out[p * 4 + 1] = out[p * 4 + 2] = out[p * 4];
      }
      break;
    }
  }
  return new ImageData(out, w, h);
}

export function decodeDDS(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x20534444) throw new Error('ไม่ใช่ไฟล์ DDS');
  const h = dv.getUint32(12, true), w = dv.getUint32(16, true);
  const pfFlags = dv.getUint32(80, true), fourCC = dv.getUint32(84, true);
  let off = 128, fmt;
  if (pfFlags & 0x4) {
    let t; if (fourCC === FOURCC('DX10')) { t = DXGI_MAP[dv.getUint32(128, true)]; off = 148; } else t = FOURCC_MAP[fourCC];
    if (!t) throw new Error('ไม่รองรับ format ของไฟล์นี้'); fmt = MASK_FMT[t] || { type: t };
  } else {
    const masks = [92, 96, 100, 104].map((p) => dv.getUint32(p, true));
    if (!(pfFlags & 0x1) && !(pfFlags & 0x2)) masks[3] = 0;
    fmt = { type: 'MASK', bpp: dv.getUint32(88, true) / 8, masks, lum: !!(pfFlags & 0x20000) };
  }
  return decodePixels(new Uint8Array(buffer), off, w, h, fmt);
}

function readBlock(src, w, h, x0, y0) {
  const px = new Uint8Array(64);
  for (let i = 0; i < 16; i++) {
    const x = Math.min(x0 + (i & 3), w - 1), y = Math.min(y0 + (i >> 2), h - 1), k = (y * w + x) * 4;
    px[i * 4] = src[k]; px[i * 4 + 1] = src[k + 1]; px[i * 4 + 2] = src[k + 2]; px[i * 4 + 3] = src[k + 3];
  }
  return px;
}

function encodeColor(px, out, o, punchThrough) {
  let mn = [255, 255, 255], mx = [0, 0, 0], transparent = false, any = false;
  for (let i = 0; i < 16; i++) {
    if (punchThrough && px[i * 4 + 3] < 128) { transparent = true; continue; }
    any = true;
    for (let c = 0; c < 3; c++) { const v = px[i * 4 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
  }
  if (!any) { mn = [0, 0, 0]; mx = [0, 0, 0]; }
  for (let c = 0; c < 3; c++) { const inset = (mx[c] - mn[c]) >> 4; mn[c] += inset; mx[c] -= inset; }
  let c0 = pack565(mx), c1 = pack565(mn);
  if (transparent ? c0 > c1 : c0 < c1) [c0, c1] = [c1, c0];
  const p0 = unpack565(c0), p1 = unpack565(c1);
  let pal = transparent ? [p0, p1, mix(p0, p1, 1, 1), null] : c0 === c1 ? [p0] : [p0, p1, mix(p0, p1, 2, 1), mix(p0, p1, 1, 2)];
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let best = 0;
    if (transparent && px[i * 4 + 3] < 128) best = 3;
    else {
      let bd = Infinity;
      pal.forEach((p, j) => {
        if (!p) return;
        const d = (px[i * 4] - p[0]) ** 2 + (px[i * 4 + 1] - p[1]) ** 2 + (px[i * 4 + 2] - p[2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
    }
    bits |= best << (i * 2);
  }
  bits >>>= 0;
  out[o] = c0 & 255; out[o + 1] = c0 >> 8; out[o + 2] = c1 & 255; out[o + 3] = c1 >> 8;
  out[o + 4] = bits & 255; out[o + 5] = (bits >>> 8) & 255; out[o + 6] = (bits >>> 16) & 255; out[o + 7] = bits >>> 24;
}

function encodeChannel(px, ch, out, o) {
  let a0 = 0, a1 = 255;
  for (let i = 0; i < 16; i++) { const v = px[i * 4 + ch]; if (v > a0) a0 = v; if (v < a1) a1 = v; }
  out[o] = a0; out[o + 1] = a1;
  const t = [a0, a1]; if (a0 > a1) for (let i = 1; i < 7; i++) t.push((((7 - i) * a0 + i * a1) / 7) | 0);
  let lo = 0, hi = 0;
  for (let i = 0; i < 16; i++) {
    const v = px[i * 4 + ch]; let best = 0, bd = Infinity;
    t.forEach((tv, j) => { const d = Math.abs(v - tv); if (d < bd) { bd = d; best = j; } });
    if (i < 8) lo |= best << (3 * i); else hi |= best << (3 * (i - 8));
  }
  out[o + 2] = lo & 255; out[o + 3] = (lo >> 8) & 255; out[o + 4] = (lo >> 16) & 255;
  out[o + 5] = hi & 255; out[o + 6] = (hi >> 8) & 255; out[o + 7] = (hi >> 16) & 255;
}

function encodeExplicitAlpha(px, out, o) {
  for (let i = 0; i < 16; i++) out[o + (i >> 1)] |= Math.round(px[i * 4 + 3] / 17) << ((i & 1) * 4);
}

export function encodePixels(img, fmt) {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(levelSize(fmt, w, h)), bs = BLOCK_BYTES[fmt.type];
  if (bs) {
    if (fmt.type === 'BC7') throw new Error('ยังไม่รองรับการ encode BC7');
    let o = 0; const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++, o += bs) {
      const px = readBlock(data, w, h, bx * 4, by * 4);
      switch (fmt.type) {
        case 'BC1': encodeColor(px, out, o, true); break;
        case 'BC2': encodeExplicitAlpha(px, out, o); encodeColor(px, out, o + 8, false); break;
        case 'BC3': encodeChannel(px, 3, out, o); encodeColor(px, out, o + 8, false); break;
        case 'BC4': encodeChannel(px, 0, out, o); break;
        case 'BC5': encodeChannel(px, 0, out, o); encodeChannel(px, 1, out, o + 8); break;
      }
    }
    return out;
  }
  const { bpp, masks, lum } = fmt; const shifts = masks.map(shiftOf);
  for (let p = 0; p < w * h; p++) {
    const k = p * 4; const px = lum ? [Math.round(data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114), 0, 0, data[k + 3]] : [data[k], data[k + 1], data[k + 2], data[k + 3]];
    let v = 0;
    for (let c = 0; c < 4; c++) {
      const m = masks[c] >>> 0; if (!m) continue;
      v |= Math.round((px[c] * (m >>> shifts[c])) / 255) << shifts[c];
    }
    v >>>= 0; for (let b = 0; b < bpp; b++) out[p * bpp + b] = (v >>> (8 * b)) & 255;
  }
  return out;
}

export function encodeDDS(img) {
  const { width: w, height: h, data } = img;
  const buf = new ArrayBuffer(128 + w * h * 4), dv = new DataView(buf);
  dv.setUint32(0, 0x20534444, true); dv.setUint32(4, 124, true); dv.setUint32(8, 0x100f, true);
  dv.setUint32(12, h, true); dv.setUint32(16, w, true); dv.setUint32(20, w * 4, true);
  dv.setUint32(76, 32, true); dv.setUint32(80, 0x41, true); dv.setUint32(88, 32, true);
  dv.setUint32(92, 0x00ff0000, true); dv.setUint32(96, 0x0000ff00, true); dv.setUint32(100, 0x000000ff, true);
  dv.setUint32(104, 0xff000000, true); dv.setUint32(108, 0x1000, true);
  const out = new Uint8Array(buf, 128);
  for (let i = 0; i < w * h * 4; i += 4) { out[i] = data[i + 2]; out[i + 1] = data[i + 1]; out[i + 2] = data[i]; out[i + 3] = data[i + 3]; }
  return new Blob([buf], { type: 'image/vnd-ms.dds' });
}
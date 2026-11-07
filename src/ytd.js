import { decodePixels, encodePixels, levelSize } from './dds.js';
const FMT = {
  0x31545844: { name: 'DXT1', type: 'BC1' }, 0x33545844: { name: 'DXT3', type: 'BC2' },
  0x35545844: { name: 'DXT5', type: 'BC3' }, 0x31495441: { name: 'ATI1', type: 'BC4' },
  0x32495441: { name: 'ATI2', type: 'BC5' }, 0x20374342: { name: 'BC7', type: 'BC7' },
  21: { name: 'A8R8G8B8', type: 'MASK', bpp: 4, masks: [0xff0000, 0xff00, 0xff, 0xff000000] },
  22: { name: 'X8R8G8B8', type: 'MASK', bpp: 4, masks: [0xff0000, 0xff00, 0xff, 0] },
  25: { name: 'A1R5G5B5', type: 'MASK', bpp: 2, masks: [0x7c00, 0x3e0, 0x1f, 0x8000] },
  28: { name: 'A8', type: 'MASK', bpp: 1, masks: [0, 0, 0, 0xff] },
  32: { name: 'A8B8G8R8', type: 'MASK', bpp: 4, masks: [0xff, 0xff00, 0xff0000, 0xff000000] },
  50: { name: 'L8', type: 'MASK', bpp: 1, masks: [0xff, 0, 0, 0], lum: true },
};

function sizeFromFlags(f) {
  const mult = ((f >>> 27) & 1) + (((f >>> 26) & 1) << 1) + (((f >>> 25) & 1) << 2) + (((f >>> 24) & 1) << 3) + (((f >>> 17) & 0x7f) << 4) + (((f >>> 11) & 0x3f) << 5) + (((f >>> 7) & 0xf) << 6) + (((f >>> 5) & 0x3) << 7) + (((f >>> 4) & 0x1) << 8);
  return (0x200 << (f & 0xf)) * mult;
}

async function pipe(u8, transform) {
  const stream = new Blob([u8]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readRSC7(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x37435352) throw new Error('ไม่ใช่ไฟล์ RSC7: ให้ extract แบบ raw จาก OpenIV/CodeWalker');
  const version = dv.getUint32(4, true);
  const sysSize = sizeFromFlags(dv.getUint32(8, true)), gfxSize = sizeFromFlags(dv.getUint32(12, true));
  const header = new Uint8Array(buffer, 0, 16).slice(), body = new Uint8Array(buffer, 16);
  let data;
  try { data = await pipe(body, new DecompressionStream('deflate-raw')); } catch { data = await pipe(body, new DecompressionStream('deflate')); }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ptr = (at) => {
    const v = view.getUint32(at, true); if (!v) return null;
    const seg = v >>> 28, off = v & 0x0fffffff;
    let r = seg === 5 ? off : seg === 6 ? sysSize + off : null;
    if (r == null || r >= data.length) throw new Error(`pointer ไม่ถูกต้อง 0x${v.toString(16)}`);
    return r;
  };
  const cstr = (at) => {
    if (at == null) return ''; let e = at; while (e < data.length && data[e]) e++;
    return new TextDecoder().decode(data.subarray(at, e));
  };
  return { header, version, data, view, sysSize, gfxSize, ptr, cstr, textures: [] };
}

export function readTextureDict(res, at) {
  const { view: d, data, ptr, cstr } = res;
  const listPtr = ptr(at + 0x30), count = d.getUint16(at + 0x38, true), list = [];
  if (listPtr == null) return list;
  for (let i = 0; i < count; i++) {
    const t = ptr(listPtr + i * 8); if (t == null) continue;
    const existing = res.textures.find((texture) => texture.address === t);
    if (existing) { list.push(existing); continue; }
    const fmtCode = d.getUint32(t + 0x58, true);
    const texture = {
      address: t, name: cstr(ptr(t + 0x28)).toLowerCase() || `texture_${i}`,
      width: d.getUint16(t + 0x50, true), height: d.getUint16(t + 0x52, true),
      levels: data[t + 0x5d] || 1, fmtCode, fmt: FMT[fmtCode] || null,
      dataOffset: ptr(t + 0x70), entry: null,
    };
    list.push(texture); res.textures.push(texture);
  }
  return list;
}

export async function parseYTD(buffer) {
  const res = await readRSC7(buffer); readTextureDict(res, 0); return res;
}

export function decodeYTDTexture(res, tex) {
  if (!tex.fmt) throw new Error(`ไม่รู้จัก format ${tex.fmtCode}`);
  return decodePixels(res.data, tex.dataOffset, tex.width, tex.height, tex.fmt);
}

function makeCanvas(w, h) { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d', { willReadFrequently: true })]; }

export async function buildYTD(res) {
  const out = res.data.slice(); const written = [], skipped = [];
  for (const tex of res.textures) {
    const e = tex.entry; if (!e?.edited) continue;
    if (!tex.fmt || tex.fmt.type === 'BC7') { skipped.push(`${tex.name} (BC7 ยังไม่รองรับ)`); continue; }
    if (e.canvas.width !== tex.width || e.canvas.height !== tex.height) { skipped.push(`${tex.name} (ขนาดไม่ตรง)`); continue; }
    let off = tex.dataOffset, src = e.canvas;
    for (let lv = 0; lv < tex.levels; lv++) {
      const w = Math.max(1, tex.width >> lv), h = Math.max(1, tex.height >> lv);
      let img;
      if (lv === 0) img = e.ctx.getImageData(0, 0, w, h);
      else {
        const [c, ctx] = makeCanvas(w, h); ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, w, h); img = ctx.getImageData(0, 0, w, h); src = c;
      }
      const size = levelSize(tex.fmt, w, h);
      if (off == null || off + size > out.length) throw new Error(`${tex.name}: ข้อมูล mipmap ไม่ครบ ไม่สามารถส่งออกได้`);
      out.set(encodePixels(img, tex.fmt), off); off += size;
    }
    written.push(tex.name);
  }
  const comp = await pipe(out, new CompressionStream('deflate-raw'));
  const file = new Uint8Array(16 + comp.length); file.set(res.header, 0); file.set(comp, 16);
  return { blob: new Blob([file], { type: 'application/octet-stream' }), written, skipped };
}
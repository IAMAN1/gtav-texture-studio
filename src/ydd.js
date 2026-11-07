import * as THREE from 'three';
import { readRSC7, readTextureDict } from './ytd.js';

const joaat = (str) => {
  let h = 0; for (const ch of str.toLowerCase()) { h = (h + ch.charCodeAt(0)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0; }
  h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; return (h + (h << 15)) >>> 0;
};
const SLOT_BY_HASH = { [joaat('DiffuseSampler')]: 'diffuse', [joaat('BumpSampler')]: 'normal', [joaat('SpecSampler')]: 'spec', [joaat('DetailSampler')]: 'detail' };

function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  if (e === 0) return s * 2 ** -14 * (f / 1024); if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

const TYPE_SIZE = [0, 4, 4, 8, 4, 8, 12, 16, 4, 4, 4, 4, 4, 4, 4, 4];
const SEM = { Position: 0, Normal: 3, TexCoord0: 6 };

function readComp(d, o, type) {
  switch (type) {
    case 1: return [half(d.getUint16(o, true)), half(d.getUint16(o + 2, true))];
    case 2: return [d.getFloat32(o, true)];
    case 3: return [0, 2, 4, 6].map((k) => half(d.getUint16(o + k, true)));
    case 5: return [d.getFloat32(o, true), d.getFloat32(o + 4, true)];
    case 6: return [0, 4, 8].map((k) => d.getFloat32(o + k, true));
    case 7: return [0, 4, 8, 12].map((k) => d.getFloat32(o + k, true));
    case 8: return [0, 1, 2, 3].map((k) => d.getUint8(o + k));
    case 9: return [0, 1, 2, 3].map((k) => d.getUint8(o + k) / 255);
    case 10: return [0, 1, 2, 3].map((k) => d.getInt8(o + k) / 127);
    default: return null;
  }
}

function readDecl(res, at) {
  const d = res.view, flags = d.getUint32(at, true), stride = d.getUint16(at + 4, true), types = d.getBigUint64(at + 8, true);
  const comps = {}; let off = 0;
  for (let i = 0; i < 16; i++) {
    if (!(flags & (1 << i))) continue;
    const type = Number((types >> BigInt(i * 4)) & 0xfn); comps[i] = { type, off }; off += TYPE_SIZE[type];
  }
  return { stride, comps };
}

function readGeometry(res, g) {
  const { view: d, ptr } = res;
  const vb = ptr(g + 0x18), ib = ptr(g + 0x38); if (vb == null || ib == null) return null;
  const stride = d.getUint16(vb + 0x08, true), vdata = ptr(vb + 0x10) ?? ptr(vb + 0x20), vcount = d.getUint32(vb + 0x18, true), declAt = ptr(vb + 0x30);
  if (vdata == null || declAt == null || !vcount) return null;
  const { comps } = readDecl(res, declAt);
  const P = comps[SEM.Position], N = comps[SEM.Normal], T = comps[SEM.TexCoord0];
  if (!P) return null;
  const pos = new Float32Array(vcount * 3), nor = N ? new Float32Array(vcount * 3) : null, uv = T ? new Float32Array(vcount * 2) : null;
  for (let v = 0; v < vcount; v++) {
    const base = vdata + v * stride;
    const p = readComp(d, base + P.off, P.type); pos.set(p.slice(0, 3), v * 3);
    if (nor) { const n = readComp(d, base + N.off, N.type); if (n) nor.set(n.slice(0, 3), v * 3); }
    if (uv) { const t = readComp(d, base + T.off, T.type); if (t) { uv[v * 2] = t[0]; uv[v * 2 + 1] = 1 - t[1]; } }
  }
  const icount = d.getUint32(ib + 0x08, true), idata = ptr(ib + 0x10);
  if (idata == null || !icount) return null;
  const idx = new Uint16Array(icount);
  for (let i = 0; i < icount; i++) idx[i] = d.getUint16(idata + i * 2, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else geo.computeVertexNormals();
  geo.computeBoundingSphere(); return geo;
}

function readShaders(res, sgAt, drawableName) {
  const { view: d, data, ptr, cstr } = res; if (sgAt == null) return [];
  try { const dict = ptr(sgAt + 0x08); if (dict != null) readTextureDict(res, dict); } catch {}
  const shPtr = ptr(sgAt + 0x10), count = d.getUint16(sgAt + 0x18, true), materials = [];
  for (let i = 0; i < count; i++) {
    const textures = {};
    try {
      const s = ptr(shPtr + i * 8), params = ptr(s), pc = data[s + 0x10]; const list = []; let vecSize = 0;
      for (let j = 0; j < pc; j++) {
        const p = params + j * 16, type = data[p]; let name = '';
        if (type === 0) { const tp = ptr(p + 8); if (tp != null) name = cstr(ptr(tp + 0x28)).toLowerCase(); } else vecSize += 16 * type;
        list.push({ type, name, hash: 0 });
      }
      const hashesAt = params + pc * 16 + vecSize;
      if (hashesAt + pc * 4 <= data.length) list.forEach((p, j) => (p.hash = d.getUint32(hashesAt + j * 4, true)));
      for (const p of list) { if (p.type !== 0 || !p.name) continue; const slot = SLOT_BY_HASH[p.hash]; if (slot && !textures[slot]) textures[slot] = p.name; }
      if (!textures.diffuse) {
        const guess = list.find((p) => p.type === 0 && p.name && !/(_n|_s|_nrm|_spec|normal)$/.test(p.name));
        if (guess) textures.diffuse = guess.name;
      }
    } catch {}
    const m = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.3 });
    m.name = `${drawableName}_shader${i}`; m.userData.textures = textures; materials.push(m);
  }
  return materials;
}

function readDrawable(res, at, fallbackName, hasName) {
  const { view: d, ptr, cstr } = res; let name = fallbackName;
  if (hasName) { try { name = cstr(ptr(at + 0xa8)) || fallbackName; } catch {} }
  const group = new THREE.Group(); group.name = name;
  const materials = readShaders(res, ptr(at + 0x10), name);
  const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x999999, side: THREE.DoubleSide }); fallbackMat.userData.textures = {};
  let list = null; for (const o of [0x50, 0x58, 0x60, 0x68]) { const l = ptr(at + o); if (l != null && d.getUint16(l + 8, true)) { list = l; break; } }
  if (list == null) return group;
  const entries = ptr(list), modelCount = d.getUint16(list + 8, true);
  for (let mi = 0; mi < modelCount; mi++) {
    const m = ptr(entries + mi * 8), gPtr = ptr(m + 0x08), gCount = d.getUint16(m + 0x10, true), mapPtr = ptr(m + 0x20);
    for (let gi = 0; gi < gCount; gi++) {
      try {
        const geo = readGeometry(res, ptr(gPtr + gi * 8)); if (!geo) continue;
        const si = mapPtr != null ? d.getUint16(mapPtr + gi * 2, true) : 0;
        const mesh = new THREE.Mesh(geo, materials[si] || fallbackMat);
        mesh.name = `${name} / model${mi} / geo${gi}`; group.add(mesh);
      } catch {}
    }
  }
  return group;
}

export async function parseDrawableFile(buffer, fileName) {
  const ext = fileName.toLowerCase().split('.').pop(), base = fileName.replace(/\.[^.]+$/, '');
  const res = await readRSC7(buffer); const { view: d, ptr } = res;
  const root = new THREE.Group(); root.rotation.x = -Math.PI / 2;
  if (ext === 'ydd') {
    const hashesPtr = ptr(0x20), listPtr = ptr(0x30), count = d.getUint16(0x38, true);
    for (let i = 0; i < count; i++) {
      try {
        const hash = hashesPtr != null ? d.getUint32(hashesPtr + i * 4, true) : i;
        const at = ptr(listPtr + i * 8); if (at != null) root.add(readDrawable(res, at, `${base}_0x${hash.toString(16)}`, true));
      } catch {}
    }
  } else if (ext === 'ydr') { root.add(readDrawable(res, 0, base, true)); }
  else if (ext === 'yft') { const at = ptr(0x30); if (at == null) throw new Error('ไม่พบ Drawable ใน .yft'); root.add(readDrawable(res, at, base, false)); }
  return { object: root, res };
}
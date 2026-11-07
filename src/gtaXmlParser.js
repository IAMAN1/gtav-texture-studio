import * as THREE from 'three';
const SIZES = { Position: 3, BlendWeights: 4, BlendIndices: 4, Normal: 3, Colour0: 4, Colour1: 4, Tangent: 4 };
const sizeOf = (n) => SIZES[n] ?? (n.startsWith('TexCoord') ? 2 : 4);
const TEX_SLOTS = { DiffuseSampler: 'diffuse', BumpSampler: 'normal', SpecSampler: 'spec', DetailSampler: 'detail' };
const child = (el, tag) => (el ? [...el.children].find((c) => c.tagName === tag) : null);
const items = (el) => (el ? [...el.children].filter((c) => c.tagName === 'Item') : []);
const nums = (s) => { const t = s.trim(); return t ? t.split(/\s+/).map(Number) : []; };

function findHighModels(d) {
  return child(d, 'DrawableModelsHigh') || child(child(d, 'DrawableModels'), 'High') || [...d.children].find((c) => c.tagName.startsWith('DrawableModels'));
}

function buildGeometry(layout, vdata, idata) {
  const lines = vdata.split('\n').map((l) => l.trim()).filter(Boolean);
  const n = lines.length;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let hasN = false, hasUV = false;
  for (let v = 0; v < n; v++) {
    const line = lines[v];
    let comps = line.split(/\s{3,}/);
    if (comps.length === layout.length) comps = comps.map(nums);
    else {
      const flat = nums(line); comps = []; let o = 0;
      for (const name of layout) { const s = sizeOf(name); comps.push(flat.slice(o, o + s)); o += s; }
    }
    layout.forEach((name, k) => {
      const c = comps[k]; if (!c) return;
      if (name === 'Position') pos.set(c.slice(0, 3), v * 3);
      else if (name === 'Normal') { nor.set(c.slice(0, 3), v * 3); hasN = true; }
      else if (name === 'TexCoord0') { uv[v * 2] = c[0]; uv[v * 2 + 1] = 1 - c[1]; hasUV = true; }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (hasUV) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = nums(idata); if (idx.length) g.setIndex(idx);
  if (hasN) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function parseCodeWalkerXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('ไฟล์ XML ไม่ถูกต้อง');
  const root = doc.documentElement;
  let drawables = root.tagName === 'Drawable' ? [root] : root.tagName === 'DrawableDictionary' ? items(root) : [...root.getElementsByTagName('Drawable')];
  if (!drawables.length) throw new Error('ไม่พบ Drawable ในไฟล์นี้');
  const group = new THREE.Group(); group.rotation.x = -Math.PI / 2;
  drawables.forEach((d, di) => {
    const name = child(d, 'Name')?.textContent.trim() || `drawable_${di}`;
    const dGroup = new THREE.Group(); dGroup.name = name;
    const materials = items(child(child(d, 'ShaderGroup'), 'Shaders')).map((sh, si) => {
      const textures = {};
      for (const p of items(child(sh, 'Parameters'))) {
        if (p.getAttribute('type') !== 'Texture') continue;
        const slot = TEX_SLOTS[p.getAttribute('name')];
        const tn = child(p, 'Name')?.textContent.trim();
        if (slot && tn) textures[slot] = tn.toLowerCase();
      }
      const m = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.3 });
      m.name = `${name}_${child(sh, 'Name')?.textContent.trim() || 'shader'}_${si}`;
      m.userData.textures = textures;
      return m;
    });
    const fallback = new THREE.MeshStandardMaterial({ color: 0x999999, side: THREE.DoubleSide });
    fallback.userData.textures = {};
    items(findHighModels(d)).forEach((model, mi) => {
      items(child(model, 'Geometries')).forEach((geo, gi) => {
        const shaderIndex = +(child(geo, 'ShaderIndex')?.getAttribute('value') || 0);
        const vb = child(geo, 'VertexBuffer');
        const layout = [...(child(vb, 'Layout')?.children || [])].map((c) => c.tagName);
        const dataEl = child(vb, 'Data') || child(vb, 'Data2');
        const ibEl = child(child(geo, 'IndexBuffer'), 'Data');
        if (!dataEl || !layout.length) return;
        const mesh = new THREE.Mesh(buildGeometry(layout, dataEl.textContent, ibEl?.textContent || ''), materials[shaderIndex] || fallback);
        mesh.name = `${name} / model${mi} / geo${gi}`;
        dGroup.add(mesh);
      });
    });
    group.add(dGroup);
  });
  return group;
}
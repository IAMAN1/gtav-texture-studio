import * as THREE from 'three';
import { createTextureEntry } from './textureEditor.js';

function canvas(width, height, paint) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  paint(c.getContext('2d')); return c;
}
function material(name, options = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0, ...options });
  if (name) m.userData.textures = { diffuse: name };
  return m;
}
function mesh(geometry, mat, name) { const m = new THREE.Mesh(geometry, mat); m.name = name; return m; }
function group(name, ...meshes) { const g = new THREE.Group(); g.name = name; g.add(...meshes); return g; }

function crateTexture() {
  return canvas(256, 256, (ctx) => {
    ctx.fillStyle = '#8a6a45'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3; i++) {
      const y = 10 + i * 80, h = 74;
      ctx.fillStyle = i % 2 ? '#96754e' : '#8a6a45'; ctx.fillRect(10, y, 236, h);
      ctx.strokeStyle = 'rgba(70,50,28,.35)'; ctx.lineWidth = 1;
      for (let g = 18; g < 246; g += 7) {
        const gy = y + 6 + ((g * 37) % (h - 10));
        ctx.beginPath(); ctx.moveTo(g, gy); ctx.quadraticCurveTo(g + 3, gy - 4, g + 2, gy + 4); ctx.stroke();
      }
      ctx.fillStyle = '#5d4527'; ctx.fillRect(10, y + h, 236, 4);
      ctx.fillStyle = '#3f3f46';
      for (const nx of [28, 228]) { ctx.beginPath(); ctx.arc(nx, y + 37, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = '#5d4527'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 248);
  });
}
function createCrate() {
  const entry = createTextureEntry('demo-crate', crateTexture());
  return { object: group('ลังไม้', mesh(new THREE.BoxGeometry(1, 1, 1), material(entry.name), 'crate')), entries: [entry] };
}

function barrelSideTexture() {
  return canvas(256, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#5a6472'); g.addColorStop(.35, '#78828f'); g.addColorStop(.65, '#717b88'); g.addColorStop(1, '#525c69');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    for (const y of [12, 52, 92]) {
      ctx.fillStyle = '#454e5a'; ctx.fillRect(0, y, 256, 10);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, y, 256, 2);
    }
    ctx.fillStyle = 'rgba(146,84,44,.5)';
    for (let x = 0; x < 256; x += 20) ctx.fillRect(x + (x % 13), 24, 4 + (x % 5), 12 + ((x * 7) % 30));
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, 256, 6); ctx.fillRect(0, 122, 256, 6);
  });
}
function barrelCapTexture() {
  return canvas(128, 128, (ctx) => {
    ctx.fillStyle = '#6b7482'; ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    g.addColorStop(0, '#848d9a'); g.addColorStop(1, '#59616d');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#454e5a'; ctx.lineWidth = 4;
    for (let r = 14; r <= 56; r += 14) { ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.stroke();
  });
}
function createBarrel() {
  const side = createTextureEntry('demo-barrel-side', barrelSideTexture());
  const cap = createTextureEntry('demo-barrel-cap', barrelCapTexture());
  const steel = { roughness: .6, metalness: .5 };
  const object = group('ถังน้ำมัน', mesh(new THREE.CylinderGeometry(.45, .45, 1.1, 24), [material(side.name, steel), material(cap.name, steel), material(cap.name, steel)], 'barrel'));
  return { object, entries: [side, cap] };
}

function carBodyTexture() {
  return canvas(256, 256, (ctx) => {
    ctx.fillStyle = '#5f8fe8'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(255,255,255,${.03 + Math.random() * .05})`; ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    ctx.strokeStyle = 'rgba(20,40,90,.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 236);
    ctx.beginPath(); ctx.moveTo(10, 86); ctx.lineTo(246, 86); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(128, 10); ctx.lineTo(128, 246); ctx.stroke();
    ctx.fillStyle = 'rgba(15,30,70,.35)'; ctx.fillRect(10, 200, 236, 46);
  });
}
function carWheelTexture() {
  return canvas(128, 128, (ctx) => {
    ctx.fillStyle = '#26292e'; ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 58);
    g.addColorStop(0, '#8f96a1'); g.addColorStop(.55, '#585f6a'); g.addColorStop(1, '#22252a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#15171b'; ctx.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12); ctx.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); ctx.stroke();
    }
    ctx.strokeStyle = '#d9dde4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 64, 8, 0, Math.PI * 2); ctx.stroke();
  });
}
function createCar() {
  const body = createTextureEntry('demo-car-body', carBodyTexture());
  const wheel = createTextureEntry('demo-car-wheel', carWheelTexture());
  const car = group('รถตัวอย่าง');
  const bodyMesh = mesh(new THREE.BoxGeometry(2, .5, 1), material(body.name, { roughness: .35, metalness: .4 }), 'body');
  bodyMesh.position.y = .4; car.add(bodyMesh);
  const cabin = mesh(new THREE.BoxGeometry(.95, .42, .9), new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: .15, metalness: .6 }), 'cabin');
  cabin.position.set(-.12, .82, 0); car.add(cabin);
  const wgeo = new THREE.CylinderGeometry(.26, .26, .2, 16), wheelMat = material(wheel.name, { roughness: .8 });
  for (const [x, z] of [[-.68, -.5], [.68, -.5], [-.68, .5], [.68, .5]]) {
    const w = mesh(wgeo, wheelMat, 'wheel'); w.rotation.z = Math.PI / 2; w.position.set(x, .26, z); car.add(w);
  }
  return { object: car, entries: [body, wheel] };
}

export const demoCatalog = [
  { id: 'crate', name: 'ลังไม้', desc: 'กล่องไม้ · แก้ texture ได้', create: createCrate },
  { id: 'barrel', name: 'ถังน้ำมัน', desc: 'โลหะเก่า · 2 texture', create: createBarrel },
  { id: 'car', name: 'รถตัวอย่าง', desc: 'ตัวถัง + กระจก + ล้อ', create: createCar },
];

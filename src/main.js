import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { parseCodeWalkerXml } from './gtaXmlParser.js';
import { decodeDDS, encodeDDS } from './dds.js';
import { parseYTD, decodeYTDTexture, buildYTD } from './ytd.js';
import { parseDrawableFile } from './ydd.js';
import { TextureEditor, createTextureEntry } from './textureEditor.js';

const $ = (id) => document.getElementById(id);
const setStatus = (message, error = false) => { $('status').textContent = message; $('status').closest('footer').classList.toggle('error', error); };
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5"/>', redo: '<path d="M21 10H10a6 6 0 0 0 0 12m11-12-5-5m5 5-5 5"/>',
  box: '<path d="m12 2 9 5-9 5-9-5Z M3 7v10l9 5 9-5V7M12 12v10M7 5l9 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1"/>',
  sliders: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="19" r="2"/>',
  move: '<path d="M12 3v18M3 12h18m-9-9-3 3m3-3 3 3m-3 15-3-3m3 3 3-3M3 12l3-3m-3 3 3 3m15-3-3-3m3 3-3 3"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>', crop: '<path d="M6 3v15h15M3 6h15v15M6 6l12 12"/>',
  brush: '<path d="m9 15 9-12 3 3-12 9Z M9 15c1 5-3 6-6 6 2-2-1-5 3-6Z"/>',
  eraser: '<path d="m3 14 10-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 9H8l-5-5a2 2 0 0 1 0-2ZM8 9l8 8M12 21h9"/>',
  fill: '<path d="m7 3 9 9-7 7-7-7Z M2 12h14M18 14s4 4 4 6a3 3 0 0 1-6 0c0-2 2-6 2-6Z"/>',
  picker: '<path d="m14 3 7 7M16 5l3-3 3 3-3 3M17 7 5 19H2v-3L14 4"/>',
  text: '<path d="M4 5V3h16v2M12 3v18M8 21h8"/>', rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>', ellipse: '<circle cx="12" cy="12" r="8"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v10c0 5-4 7-8 7-3 0-5-3-7-6l-3-4a2 2 0 0 1 3-2l3 3Z"/>',
  fit: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  shield: '<path d="m12 3 8 3v7c0 5-8 9-8 9s-8-4-8-9V6Z m-4 9 3 3 5-6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M3 6h18M6 6l1 15h10l1-15M9 6V3h6v3M10 10v7m4-7v7"/>',
  up: '<path d="m6 14 6-6 6 6"/>', down: '<path d="m6 10 6 6 6-6"/>', rotate: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  resize: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16 16 8M8 11v5h5m-2-8h5v5"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', eyeOff: '<path d="m3 3 18 18M9 5c7-2 13 7 13 7l-3 4M6 6 2 12s4 7 10 7l4-1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>', unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 7-3"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`; }
function decorateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon))); }
decorateIcons();

const state = { model: null, meshes: [], textures: new Map(), selectedMesh: null };
const editor = new TextureEditor({
  wrap: $('canvasWrap'),
  ui: Object.fromEntries(['tool', 'color', 'size', 'opacity', 'hue', 'sat', 'bri', 'contrast', 'tolerance', 'textContent', 'fontSize', 'fontWeight', 'fontFamily', 'shapeFill', 'stampInput', 'layerRatio'].map((id) => [id, $(id)])),
  onChange: updateEditorUI, onStatus: setStatus,
});
const matsOf = (mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
let renderer, scene, camera, controls, selBox;

const toolInfo = {
  move: ['ย้ายเลเยอร์', 'V', 'ลากเพื่อย้าย · ลากมุมเพื่อปรับขนาด · Ctrl+V แปะรูป', 'move'],
  select: ['เลือกพื้นที่', 'M', 'ลากกรอบ แล้วคัดลอก ลบ หรือตัดพื้นที่ที่เลือก', 'select'],
  crop: ['ตัดรูป', 'C', 'ลากพื้นที่ที่ต้องการเก็บ แล้วกดตัดรูปหรือ Enter', 'crop'],
  brush: ['แปรง', 'B', 'ลากเพื่อวาดบนเลเยอร์ที่เลือก', 'brush'], eraser: ['ยางลบ', 'E', 'ลบภาพบนเลเยอร์ที่เลือก ไม่กระทบเลเยอร์อื่น', 'eraser'],
  fill: ['เทสี', 'G', 'คลิกเพื่อเติมพื้นที่สีใกล้เคียงกันบนเลเยอร์ที่เลือก', 'fill'], picker: ['ดูดสี', 'I', 'คลิกบนรูปเพื่อเลือกสี', 'picker'],
  text: ['ข้อความ', 'T', 'พิมพ์ในแผงปรับแต่ง แล้วคลิกตำแหน่งบนรูป', 'text'],
  rect: ['สี่เหลี่ยม', 'U', 'ลากเพื่อสร้างรูปทรงบนเลเยอร์ใหม่', 'rect'], ellipse: ['วงกลม', 'O', 'ลากเพื่อสร้างรูปทรงบนเลเยอร์ใหม่', 'ellipse'],
  stamp: ['แปะรูป / โลโก้', 'P', 'เพิ่มรูปเป็นเลเยอร์ แล้วใช้เครื่องมือย้าย', 'image'], hand: ['เลื่อนภาพ', 'H', 'ลากเพื่อเลื่อนภาพ หรือกด Space ค้าง', 'hand'],
};
function setTool(tool) {
  end3DPaint(); editor.end(); $('tool').value = tool;
  const [name, key, hint, symbol] = toolInfo[tool];
  $('toolName').textContent = name; $('toolKey').textContent = key; $('toolHint').textContent = hint; $('toolIcon').innerHTML = icon(symbol);
  document.querySelectorAll('[data-tool]').forEach((button) => { const active = button.dataset.tool === tool; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  document.querySelectorAll('.brush-option').forEach((el) => el.hidden = !['brush', 'eraser', 'rect', 'ellipse', 'text'].includes(tool));
  document.querySelector('.fill-option').hidden = tool !== 'fill';
  $('textOptions').hidden = tool !== 'text'; $('shapeOptions').hidden = !['rect', 'ellipse'].includes(tool); $('stampOptions').hidden = tool !== 'stamp';
  $('canvasWrap').style.cursor = tool === 'hand' ? 'grab' : tool === 'move' ? 'move' : tool === 'text' ? 'text' : 'crosshair';
  if (['text', 'stamp'].includes(tool) && innerWidth <= 720) { $('app').classList.add('properties-open'); $('toggleProperties').setAttribute('aria-expanded', 'true'); }
  editor.drawOverlay();
}
function updateReadouts() {
  $('colorValue').textContent = $('color').value.toUpperCase();
  $('sizeValue').textContent = `${$('size').value} px`; $('opacityValue').textContent = `${Math.round($('opacity').value * 100)}%`; $('toleranceValue').textContent = $('tolerance').value;
  for (const id of ['hue', 'sat', 'bri', 'contrast']) $(`${id}Value`).textContent = $(id).value + (id === 'hue' ? '°' : '');
}
function updateEditorUI(kind = 'all') {
  const entry = editor.entry;
  if (kind === 'view') { $('zoomActual').textContent = `${Math.round(editor.zoom * 100)}%`; return; }
  updateReadouts();
  $('documentName').textContent = entry?.name || 'ยังไม่มีเอกสาร';
  $('documentDirty').hidden = !entry?.edited && !editor.adjust;
  $('documentSize').textContent = entry ? `${entry.canvas.width} × ${entry.canvas.height} px · RGBA` : '—';
  $('undo').disabled = !entry || (!entry.undo.length && !editor.adjust); $('redo').disabled = !entry?.redo.length;
  if (kind === 'pixels' || kind === 'color') return;
  $('selectionActions').hidden = !editor.selection;
  if (editor.selection) $('selectionSize').textContent = `${editor.selection.width} × ${editor.selection.height} px`;
  if (kind === 'selection' || kind === 'adjust') return;
  const editable = !!editor.layer && !editor.layer.locked && editor.layer.visible;
  for (const id of ['exportPng', 'exportJpg', 'exportDds', 'addLayer', 'addImageLayer', 'duplicateLayer', 'zoomIn', 'zoomOut', 'zoomFit', 'zoomActual', 'reset', 'flipH', 'flipImageV']) $(id).disabled = !entry;
  $('exportYtd').disabled = !entry?.ytd;
  $('resizeImage').disabled = !entry || !!entry.ytd;
  $('rotateLeft').disabled = $('rotateRight').disabled = !entry || (!!entry.ytd && entry.canvas.width !== entry.canvas.height);
  $('gameSizeHint').hidden = !entry?.ytd;
  for (const id of ['applyAdjust', 'cancelAdjust', 'hue', 'sat', 'bri', 'contrast']) $(id).disabled = !editable;
  document.querySelectorAll('[data-filter]').forEach((button) => button.disabled = !editable);
  $('deleteLayer').disabled = !editable || entry.layers.length <= 1;
  $('layerUp').disabled = !editable || entry.layers.at(-1) === editor.layer;
  $('layerDown').disabled = !editable || entry.layers[0] === editor.layer;
  $('layerProperties').hidden = !entry;
  $('layerCount').textContent = entry?.layers.length || 0;
  if (entry) {
    const layer = editor.layer;
    $('layerName').value = layer.name; $('layerOpacity').value = layer.opacity; $('layerOpacityValue').textContent = `${Math.round(layer.opacity * 100)}%`; $('layerBlend').value = layer.blend;
    $('layerX').value = Math.round(layer.x); $('layerY').value = Math.round(layer.y); $('layerWidth').value = Math.round(layer.width); $('layerHeight').value = Math.round(layer.height);
    for (const id of ['layerName', 'layerOpacity', 'layerBlend', 'layerX', 'layerY', 'layerWidth', 'layerHeight']) $(id).disabled = layer.locked;
    buildLayerList();
    for (const button of $('texList').querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.id === entry.id);
      if (button.dataset.id === entry.id) { drawThumbnail(button.querySelector('canvas'), entry.canvas); button.querySelector('.asset-sub').textContent = textureDescription(entry); }
    }
  }
}
function drawThumbnail(canvas, source) {
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d'), ratio = Math.min(48 / source.width, 48 / source.height);
  ctx.drawImage(source, (48 - source.width * ratio) / 2, (48 - source.height * ratio) / 2, source.width * ratio, source.height * ratio);
}
function buildLayerList() {
  const list = $('layerList'); list.replaceChildren();
  for (const layer of [...editor.entry.layers].reverse()) {
    const row = document.createElement('li'); row.className = 'layer-row'; row.classList.toggle('active', layer.id === editor.entry.activeLayerId);
    const eye = document.createElement('button'); eye.innerHTML = icon(layer.visible ? 'eye' : 'eyeOff'); eye.setAttribute('aria-label', `${layer.visible ? 'ซ่อน' : 'แสดง'} ${layer.name}`); eye.title = eye.getAttribute('aria-label'); eye.setAttribute('aria-pressed', layer.visible);
    eye.onclick = () => { end3DPaint(); editor.changeLayer({ visible: !layer.visible }, layer.id); };
    const select = document.createElement('button'); select.className = 'layer-select'; select.setAttribute('aria-pressed', layer.id === editor.entry.activeLayerId);
    const thumbnail = document.createElement('canvas'); drawThumbnail(thumbnail, layer.canvas);
    const name = document.createElement('span'); name.textContent = layer.name; name.title = layer.name;
    select.append(thumbnail, name); select.onclick = () => { end3DPaint(); editor.selectLayer(layer.id); };
    const lock = document.createElement('button'); lock.innerHTML = icon(layer.locked ? 'lock' : 'unlock'); lock.setAttribute('aria-label', `${layer.locked ? 'ปลดล็อก' : 'ล็อก'} ${layer.name}`); lock.title = lock.getAttribute('aria-label'); lock.setAttribute('aria-pressed', layer.locked); lock.onclick = () => { end3DPaint(); editor.changeLayer({ locked: !layer.locked }, layer.id); };
    row.append(eye, select, lock); list.append(row);
  }
}

function textureDescription(entry) { return `${entry.canvas.width} × ${entry.canvas.height}${entry.format ? ' · ' + entry.format : ''}${entry.ytd ? ' · ' + entry.ytd.fileName : ''}`; }
function buildTexList() {
  const list = $('texList'); list.replaceChildren();
  $('assetCount').textContent = $('textureCount').textContent = state.textures.size;
  for (const entry of state.textures.values()) {
    const row = document.createElement('li'), button = document.createElement('button'); button.className = 'asset-button'; button.dataset.id = entry.id;
    button.classList.toggle('active', editor.entry === entry);
    const thumbnail = document.createElement('canvas'); drawThumbnail(thumbnail, entry.canvas);
    const info = document.createElement('span'); info.className = 'asset-text';
    const name = document.createElement('span'); name.className = 'asset-name'; name.textContent = entry.name;
    const sub = document.createElement('span'); sub.className = 'asset-sub'; sub.textContent = textureDescription(entry);
    info.append(name, sub); button.append(thumbnail, info); row.append(button); list.append(row);
    button.onclick = () => {
      setActiveTexture(entry);
      if (state.selectedMesh) { matsOf(state.selectedMesh).forEach((material) => assignTexture(material, entry)); setStatus(`กำหนด ${entry.name} ให้ ${state.selectedMesh.name || 'mesh'} แล้ว`); }
    };
  }
}
function setActiveTexture(entry) { if (paint && paint.entry !== entry) end3DPaint(); editor.setEntry(entry); updateEditorUI(); }
function registerTexture(entry) { state.textures.set(entry.id, entry); return entry; }
function addResourceTextures(resource, fileName) {
  resource.fileName = fileName;
  const entries = [], failures = [];
  for (const texture of resource.textures) {
    try {
      const entry = createTextureEntry(texture.name, decodeYTDTexture(resource, texture));
      entry.ytd = resource; entry.format = texture.fmt?.name; texture.entry = entry;
      entries.push(registerTexture(entry));
    } catch (error) { failures.push(`${texture.name}: ${error.message}`); }
  }
  resource.decodeFailures = failures;
  return entries;
}
async function loadTextureFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.ytd')) {
    const resource = await parseYTD(await file.arrayBuffer());
    const entries = addResourceTextures(resource, file.name);
    return { entries, warnings: resource.decodeFailures };
  }
  if (!/\.(dds|png|jpe?g|webp|bmp)$/i.test(file.name)) throw new Error('รองรับ PNG, JPG, WebP, BMP, DDS และ YTD');
  const source = lower.endsWith('.dds') ? decodeDDS(await file.arrayBuffer()) : await createImageBitmap(file);
  try { return { entries: [registerTexture(createTextureEntry(file.name.replace(/\.[^.]+$/, '').toLowerCase(), source))], warnings: [] }; }
  finally { source.close?.(); }
}
async function importTextures(files) {
  const failures = []; let last, count = 0;
  $('texInput').disabled = true; $('openImage').disabled = true;
  try {
    for (const file of files) {
      try {
        setStatus(`กำลังเปิด ${file.name}…`);
        const result = await loadTextureFile(file); count += result.entries.length; last = result.entries.at(-1) || last; failures.push(...result.warnings);
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    buildTexList(); const matched = autoAssignAll(); if (last) { setActiveTexture(last); setView('2d'); }
    setStatus(`${count ? `เปิด ${count} รูปแล้ว${matched ? ` · จับคู่ ${matched} material` : ''}` : 'ไม่สามารถเปิดไฟล์ได้'}${failures.length ? ' · ' + failures.join(' | ') : ''}`, failures.length > 0);
  } finally { $('texInput').disabled = false; $('openImage').disabled = false; }
}
async function importLayers(files) {
  if (!editor.entry) return importTextures(files);
  const target = editor.entry, failures = []; let count = 0;
  $('stampInput').disabled = true;
  try {
    for (const file of files) {
      try {
        if (!/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) throw new Error('เพิ่มเลเยอร์ด้วยไฟล์ PNG, JPG, WebP หรือ BMP');
        const image = await createImageBitmap(file);
        try {
          if (image.width > 8192 || image.height > 8192 || image.width * image.height > 16777216) throw new Error('รูปใหญ่เกิน 16 ล้านพิกเซล');
          setActiveTexture(target); if (editor.addLayer(file.name.replace(/\.[^.]+$/, ''), image)) count++;
        } finally { image.close(); }
      } catch (error) { failures.push(`${file.name}: ${error.message}`); }
    }
    setTool('move'); setStatus(`เพิ่ม ${count} เลเยอร์แล้ว — ลากเพื่อย้าย หรือปรับขนาดด้านขวา${failures.length ? ' · ' + failures.join(' | ') : ''}`, failures.length > 0);
  } finally { $('stampInput').disabled = false; }
}
function assignTexture(material, entry) {
  material.map = entry.texture; material.color?.set(0xffffff); material.userData.texEntry = entry; material.needsUpdate = true;
}
function autoAssignAll() {
  let count = 0;
  for (const mesh of state.meshes) for (const material of matsOf(mesh)) {
    if (material.userData.texEntry) continue;
    const name = material.userData.textures?.diffuse;
    const entry = [...state.textures.values()].findLast((item) => item.name === name);
    if (entry) { assignTexture(material, entry); count++; }
  }
  return count;
}
function buildMeshList() {
  const list = $('meshList'); list.replaceChildren(); $('meshCount').textContent = state.meshes.length;
  for (const mesh of state.meshes) {
    const row = document.createElement('li'), button = document.createElement('button'); button.className = 'asset-button'; button.textContent = mesh.name || 'mesh';
    button.onclick = () => {
      state.selectedMesh = mesh;
      list.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      selBox.setFromObject(mesh); selBox.visible = true;
      const entry = matsOf(mesh)[0].userData.texEntry; if (entry) setActiveTexture(entry);
      setStatus(`เลือก ${mesh.name || 'mesh'} — คลิก Texture เพื่อกำหนดให้โมเดล`);
    };
    row.append(button); list.append(row);
  }
}

function init3D() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); $('viewport').append(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1e25);
    camera = new THREE.PerspectiveCamera(45, 1, .01, 1000); camera.position.set(0, 1, 3);
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1.5); light.position.set(3, 5, 4); scene.add(light);
    scene.add(new THREE.GridHelper(10, 20, 0x4a5163, 0x303744));
    selBox = new THREE.BoxHelper(undefined, 0x8aafff); selBox.visible = false; scene.add(selBox);
    new ResizeObserver(resize3D).observe($('viewport'));
    renderer.setAnimationLoop(() => { if ($('app').dataset.view !== '2d') { controls.update(); if (selBox.visible) selBox.update(); renderer.render(scene, camera); } });
  } catch (error) {
    renderer = null; $('modelEmpty').querySelector('p').textContent = 'อุปกรณ์นี้ไม่รองรับ WebGL แต่เครื่องมือแก้ไขรูป 2D ยังใช้งานได้';
    $('modelInput').disabled = true; $('openModel').disabled = true; setStatus('ไม่สามารถเปิด 3D ได้ — ยังแก้ไขรูป 2D ได้ตามปกติ', true);
  }
}
function resize3D() {
  const width = $('viewport').clientWidth, height = $('viewport').clientHeight;
  if (!renderer || !width || !height) return;
  renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
}
function setView(view) {
  end3DPaint(); editor.end(); $('app').dataset.view = view;
  document.querySelectorAll('button[data-view]').forEach((button) => { const active = button.dataset.view === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); });
  requestAnimationFrame(() => { resize3D(); if (editor.autoFit) editor.fit(); });
}
function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()).length() || 1, center = box.getCenter(new THREE.Vector3());
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2, angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  const distance = size * .575 / Math.sin(angle);
  controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(0, .2, 1.2).normalize().multiplyScalar(distance));
  camera.near = size / 1000; camera.far = Math.max(size * 100, distance * 2); camera.updateProjectionMatrix(); controls.update();
}
function flipAllUV() {
  for (const mesh of state.meshes) {
    const uv = mesh.geometry.attributes.uv; if (!uv) continue;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); uv.needsUpdate = true;
  }
}
async function loadModel(file) {
  if (!renderer) throw new Error('อุปกรณ์นี้ไม่รองรับมุมมอง 3D');
  const ext = file.name.toLowerCase().split('.').pop(); let object, embedded = [], warnings = [];
  if (['ydd', 'ydr', 'yft'].includes(ext)) {
    const parsed = await parseDrawableFile(await file.arrayBuffer(), file.name); object = parsed.object;
    if (parsed.res.textures.length) { embedded = addResourceTextures(parsed.res, file.name); warnings = parsed.res.decodeFailures; }
  } else if (ext === 'xml') object = parseCodeWalkerXml(await file.text());
  else if (['glb', 'gltf'].includes(ext)) object = (await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')).scene;
  else if (ext === 'obj') object = new OBJLoader().parse(await file.text());
  else if (ext === 'fbx') object = new FBXLoader().parse(await file.arrayBuffer(), '');
  else throw new Error(`ไม่รองรับโมเดล .${ext}`);
  const meshes = [];
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const material of matsOf(mesh)) { material.side = THREE.DoubleSide; material.wireframe = $('wireframe').checked; material.userData.textures ??= {}; }
    meshes.push(mesh);
  });
  if (!meshes.length) throw new Error('ไม่พบ mesh ในโมเดลนี้');
  if (state.model) {
    scene.remove(state.model);
    state.model.traverse((mesh) => { mesh.geometry?.dispose(); if (mesh.isMesh) matsOf(mesh).forEach((material) => material.dispose()); });
  }
  state.model = object; state.meshes = meshes; state.selectedMesh = null; selBox.visible = false; scene.add(object);
  if ($('flipV').checked) flipAllUV();
  buildMeshList(); buildTexList(); const matched = autoAssignAll();
  $('modelEmpty').hidden = true; $('frameModel').disabled = false;
  if (embedded.length) setActiveTexture(embedded[0]); setView(editor.entry ? 'split' : '3d');
  requestAnimationFrame(() => frameObject(object));
  setStatus(`โหลด ${file.name} · ${meshes.length} mesh · จับคู่ ${matched} material${warnings.length ? ' · ' + warnings.join(' | ') : ''}`, warnings.length > 0);
}
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(); let paint = null;
function hitTest(event) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera); return raycaster.intersectObjects(state.meshes, false).find((hit) => hit.uv);
}
const hitMaterial = (hit) => Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
$('viewport').addEventListener('pointerdown', (event) => {
  if (!$('paint3d').checked || !renderer || event.button !== 0) return;
  const hit = hitTest(event); if (!hit) return;
  const entry = hitMaterial(hit).userData.texEntry; if (!entry) { setStatus('เลือก mesh แล้วคลิก Texture เพื่อกำหนดภาพก่อน', true); return; }
  event.stopImmediatePropagation(); event.preventDefault(); setActiveTexture(entry);
  if (editor.paintUV(entry, hit.uv, 'down')) { paint = { entry }; controls.enabled = false; $('viewport').setPointerCapture(event.pointerId); }
}, { capture: true });
$('viewport').addEventListener('pointermove', (event) => {
  if (!paint) return;
  if (editor.entry !== paint.entry || !editor.editable()) { end3DPaint(); return; }
  const hit = hitTest(event);
  if (hit && hitMaterial(hit).userData.texEntry === paint.entry) editor.paintUV(paint.entry, hit.uv, 'move');
  else editor.last = null;
});
function end3DPaint() { if (!paint) return; paint = null; editor.end(); controls.enabled = true; updateEditorUI(); }
window.addEventListener('pointerup', end3DPaint); window.addEventListener('pointercancel', end3DPaint);

function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url;
  link.download = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); $('exportMenu').open = false;
}
async function exportImage(type) {
  if (!editor.entry) return;
  editor.commitAdjust();
  const entry = editor.entry, source = entry.canvas;
  if (type === 'dds') { download(encodeDDS(entry.ctx.getImageData(0, 0, source.width, source.height)), `${entry.name}.dds`); setStatus('ส่งออก DDS แบบ BGRA8 ไม่บีบอัด ไม่มี mipmap แล้ว'); return; }
  let canvas = source;
  if (type === 'jpg') {
    canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(source, 0, 0);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type === 'jpg' ? 'image/jpeg' : 'image/png', .95));
  if (!blob) { setStatus('สร้างไฟล์ไม่สำเร็จ ลองลดขนาดรูปแล้วส่งออกใหม่', true); return; }
  download(blob, `${entry.name}.${type}`); setStatus(`ส่งออก ${type.toUpperCase()} รวมเลเยอร์ที่แสดงอยู่แล้ว`);
}
$('exportPng').onclick = () => exportImage('png'); $('exportJpg').onclick = () => exportImage('jpg'); $('exportDds').onclick = () => exportImage('dds');
$('exportYtd').onclick = async () => {
  const resource = editor.entry?.ytd; if (!resource) return;
  editor.commitAdjust(); $('exportYtd').disabled = true; setStatus('กำลังสร้างไฟล์เกม…');
  try {
    const { blob, written, skipped } = await buildYTD(resource);
    if (!written.length) { setStatus(skipped.length ? `ส่งออกไม่ได้: ${skipped.join(' | ')}` : 'ยังไม่มี Texture ที่ถูกแก้ไข', true); return; }
    download(blob, resource.fileName);
    setStatus(`ส่งออก ${resource.fileName} · แก้ไข ${written.length} Texture${skipped.length ? ' · ข้าม: ' + skipped.join(' | ') : ''} · บีบอัดตามฟอร์แมตเดิมและสร้าง mipmap ใหม่`, skipped.length > 0);
  } catch (error) { setStatus(error.message, true); }
  finally { $('exportYtd').disabled = false; }
};
let dialogMode = 'new';
function openDocumentDialog(mode) {
  dialogMode = mode;
  $('dialogTitle').textContent = mode === 'resize' ? 'ปรับขนาดรูป' : 'สร้างรูปใหม่'; $('dialogSubmit').textContent = mode === 'resize' ? 'ปรับขนาด' : 'สร้างเอกสาร';
  for (const id of ['documentNameLabel', 'documentBackgroundLabel']) $(id).hidden = mode === 'resize';
  $('newName').required = mode === 'new'; $('resizeRatioLabel').hidden = mode !== 'resize';
  $('newWidth').value = mode === 'resize' ? editor.entry.canvas.width : 1024;
  $('newHeight').value = mode === 'resize' ? editor.entry.canvas.height : 1024;
  $('documentDialog').showModal();
}
$('newDocument').onclick = () => openDocumentDialog('new'); $('resizeImage').onclick = () => openDocumentDialog('resize');
for (const id of ['newWidth', 'newHeight']) $(id).addEventListener('input', () => {
  if (dialogMode !== 'resize' || !$('resizeRatio').checked || !$(id).value) return;
  const ratio = editor.entry.canvas.width / editor.entry.canvas.height;
  if (id === 'newWidth') $('newHeight').value = Math.max(1, Math.round(+$('newWidth').value / ratio));
  else $('newWidth').value = Math.max(1, Math.round(+$('newHeight').value * ratio));
});
$('documentForm').onsubmit = (event) => {
  event.preventDefault(); const width = +$('newWidth').value, height = +$('newHeight').value;
  if (!$('documentForm').reportValidity()) return;
  if (dialogMode === 'resize') editor.resize(width, height);
  else {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    if ($('newBackground').value !== 'transparent') { const ctx = canvas.getContext('2d'); ctx.fillStyle = $('newBackground').value === 'white' ? '#fff' : '#000'; ctx.fillRect(0, 0, width, height); }
    const entry = registerTexture(createTextureEntry($('newName').value.trim() || 'untitled', canvas)); buildTexList(); setActiveTexture(entry); setView('2d');
  }
  $('documentDialog').close(); setStatus(dialogMode === 'resize' ? `ปรับขนาดเป็น ${width} × ${height} px แล้ว` : 'สร้างรูปใหม่แล้ว — เพิ่มรูป ข้อความ หรือวาดได้เลย');
};
$('demoDocument').onclick = () => {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#edece6'; ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = '#d4d5d0'; ctx.lineWidth = 1;
  for (let i = 64; i < 1024; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke(); }
  ctx.fillStyle = '#2c4e91'; ctx.fillRect(80, 80, 864, 48);
  ctx.fillStyle = '#253e69'; ctx.font = '700 32px sans-serif'; ctx.fillText('TEXTURE STUDIO / 001', 80, 194);
  ctx.fillStyle = '#7898d0'; ctx.beginPath(); ctx.arc(698, 453, 196, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dca476'; ctx.fillRect(130, 303, 306, 306); ctx.fillStyle = '#edece6'; ctx.beginPath(); ctx.arc(283, 456, 76, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#253e69'; ctx.font = '700 124px sans-serif'; ctx.fillText('MAKE IT', 80, 788); ctx.fillText('YOUR OWN.', 80, 912);
  const entry = registerTexture(createTextureEntry('studio-sample', canvas)); buildTexList(); setActiveTexture(entry); setStatus('ภาพตัวอย่างพร้อมแล้ว — ลองเพิ่มเลเยอร์และวาด หรือตัดรูปได้เลย');
};
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.onclick = () => button.closest('dialog').close());
$('help').onclick = () => $('helpDialog').showModal();

for (const id of ['openImage', 'emptyOpen']) $(id).onclick = () => $('texInput').click();
for (const id of ['importLayer', 'addImageLayer']) $(id).onclick = () => $('stampInput').click();
$('openModel').onclick = () => $('modelInput').click();
$('texInput').onchange = async (event) => { const files = [...event.target.files]; await importTextures(files); event.target.value = ''; };
$('stampInput').onchange = async (event) => { const files = [...event.target.files]; await importLayers(files); event.target.value = ''; };
$('modelInput').onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  event.target.disabled = true;
  try { setStatus(`กำลังโหลด ${file.name}…`); await loadModel(file); } catch (error) { setStatus(error.message, true); }
  finally { event.target.disabled = false; event.target.value = ''; }
};
document.querySelectorAll('[data-tool]').forEach((button) => button.onclick = () => setTool(button.dataset.tool));
$('tool').onchange = () => setTool($('tool').value);
document.querySelectorAll('button[data-view]').forEach((button) => button.onclick = () => setView(button.dataset.view));
for (const id of ['color', 'size', 'opacity', 'tolerance']) $(id).addEventListener('input', updateReadouts);
for (const id of ['hue', 'sat', 'bri', 'contrast']) $(id).addEventListener('input', () => editor.previewAdjust(+$('hue').value, +$('sat').value, +$('bri').value, +$('contrast').value));
$('applyAdjust').onclick = () => editor.commitAdjust(); $('cancelAdjust').onclick = () => editor.cancelAdjust();
document.querySelectorAll('[data-filter]').forEach((button) => button.onclick = () => editor.applyFilter(button.dataset.filter));
$('undo').onclick = () => editor.undo(); $('redo').onclick = () => editor.redo();
$('reset').onclick = () => { if (confirm('คืนรูปต้นฉบับและลบเลเยอร์ทั้งหมด? ย้อนกลับด้วย Ctrl+Z ได้')) editor.reset(); };
$('addLayer').onclick = () => { editor.addLayer(); setTool('brush'); };
$('duplicateLayer').onclick = () => editor.duplicateLayer(); $('deleteLayer').onclick = () => editor.deleteLayer();
$('layerUp').onclick = () => editor.reorderLayer(1); $('layerDown').onclick = () => editor.reorderLayer(-1);
$('layerName').onchange = () => editor.changeLayer({ name: $('layerName').value.trim() || 'เลเยอร์' });
$('layerBlend').onchange = () => editor.changeLayer({ blend: $('layerBlend').value });
for (const id of ['layerX', 'layerY', 'layerWidth', 'layerHeight']) $(id).onchange = () => {
  if (!editor.layer) return;
  const value = +$(id).value;
  if (!Number.isFinite(value) || !$(id).value || !$(id).reportValidity()) { updateEditorUI(); return; }
  const key = { layerX: 'x', layerY: 'y', layerWidth: 'width', layerHeight: 'height' }[id], values = { [key]: value };
  if ($('layerRatio').checked && (key === 'width' || key === 'height')) {
    const ratio = editor.layer.width / editor.layer.height;
    if (key === 'width') values.height = Math.max(1, Math.round(value / ratio)); else values.width = Math.max(1, Math.round(value * ratio));
  }
  editor.changeLayer(values);
};
let opacityEditing = false;
$('layerOpacity').oninput = () => {
  const value = +$('layerOpacity').value;
  if (!opacityEditing) { editor.commitAdjust(); editor.pushUndo(); opacityEditing = true; }
  editor.layer.opacity = value; $('layerOpacity').value = value; $('layerOpacityValue').textContent = `${Math.round(value * 100)}%`; editor.render(true);
};
$('layerOpacity').onchange = () => { opacityEditing = false; updateEditorUI(); };
$('cropSelection').onclick = () => editor.cropSelection(); $('copySelection').onclick = () => editor.copySelection();
$('keepSelection').onclick = () => editor.deleteSelection(true); $('clearSelection').onclick = () => editor.clearSelection();
$('zoomIn').onclick = () => editor.setZoom(editor.zoom * 1.25); $('zoomOut').onclick = () => editor.setZoom(editor.zoom / 1.25);
$('zoomActual').onclick = () => editor.setZoom(1); $('zoomFit').onclick = () => editor.fit();
$('rotateLeft').onclick = () => editor.transformDocument('left'); $('rotateRight').onclick = () => editor.transformDocument('right');
$('flipH').onclick = () => editor.transformDocument('horizontal'); $('flipImageV').onclick = () => editor.transformDocument('vertical');
$('flipV').onchange = flipAllUV;
$('wireframe').onchange = () => state.meshes.forEach((mesh) => matsOf(mesh).forEach((material) => material.wireframe = $('wireframe').checked));
$('paint3d').onchange = () => { end3DPaint(); if ($('paint3d').checked) { setTool('brush'); if ($('app').dataset.view === '2d') setView('split'); } };
$('frameModel').onclick = () => { if (state.model) frameObject(state.model); };
for (const [id, className] of [['toggleAssets', 'assets-open'], ['toggleProperties', 'properties-open']]) $(id).onclick = () => {
  const open = $('app').classList.toggle(className); $(id).setAttribute('aria-expanded', open);
  if (open) { const other = className === 'assets-open' ? 'properties-open' : 'assets-open'; $('app').classList.remove(other); $(id === 'toggleAssets' ? 'toggleProperties' : 'toggleAssets').setAttribute('aria-expanded', 'false'); }
};
window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && key === 'z') { event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo(); }
  else if (ctrl && key === 'y') { event.preventDefault(); editor.redo(); }
  else if (ctrl && key === 'j') { event.preventDefault(); editor.duplicateLayer(); }
  else if (ctrl && key === 'd') { event.preventDefault(); editor.clearSelection(); }
  else if (ctrl && key === 's') { event.preventDefault(); exportImage('png'); }
  else if (key === 'escape') { editor.clearSelection(); editor.cancelAdjust(); $('exportMenu').open = false; $('app').classList.remove('assets-open', 'properties-open'); }
  else if (key === 'enter' && editor.selection && $('tool').value === 'crop') { event.preventDefault(); editor.cropSelection(); }
  else if (key === 'delete' && editor.selection) { event.preventDefault(); editor.deleteSelection(); }
  else if (event.code === 'Space' && !event.target.closest('button, summary, a')) { event.preventDefault(); editor.spaceHeld = true; $('canvasWrap').style.cursor = 'grab'; }
  else if (!ctrl && !event.altKey) { const tool = Object.entries(toolInfo).find(([, info]) => info[1].toLowerCase() === key)?.[0]; if (tool) setTool(tool); }
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') { editor.spaceHeld = false; $('canvasWrap').style.cursor = $('tool').value === 'hand' ? 'grab' : $('tool').value === 'move' ? 'move' : 'crosshair'; } });
window.addEventListener('blur', () => { editor.spaceHeld = false; editor.end(); end3DPaint(); });
window.addEventListener('paste', (event) => {
  if (event.target.closest('input, textarea, [contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
  if (files.length) { event.preventDefault(); importLayers(files); }
});
window.addEventListener('beforeunload', (event) => { if ([...state.textures.values()].some((entry) => entry.edited) || editor.adjust) { event.preventDefault(); event.returnValue = ''; } });
let dragDepth = 0;
window.addEventListener('dragenter', (event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth++; $('dropOverlay').hidden = false; });
window.addEventListener('dragover', (event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('dropOverlay').hidden = true; });
window.addEventListener('drop', async (event) => {
  event.preventDefault(); dragDepth = 0; $('dropOverlay').hidden = true;
  const files = [...event.dataTransfer.files]; if (!files.length) return;
  const modelFiles = files.filter((file) => /\.(ydd|ydr|yft|xml|glb|gltf|obj|fbx)$/i.test(file.name));
  for (const file of modelFiles) { try { await loadModel(file); } catch (error) { setStatus(error.message, true); } }
  const imageFiles = files.filter((file) => !modelFiles.includes(file));
  if (!imageFiles.length) return;
  if (event.target.closest('#canvasWrap') && editor.entry && imageFiles.every((file) => /\.(png|jpe?g|webp|bmp)$/i.test(file.name))) await importLayers(imageFiles);
  else await importTextures(imageFiles);
});
init3D(); setTool('brush'); updateEditorUI();

export { editor, state };

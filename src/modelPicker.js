import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { parseDrawableFile } from './ydd.js';
import { parseCodeWalkerXml } from './gtaXmlParser.js';

let previewRenderer = null, previewScene = null, previewCamera = null, previewObject = null;

function initPreview() {
  if (previewRenderer) return;
  previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  previewRenderer.setPixelRatio(1);
  previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0x1b1e25);
  previewCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2));
  const light = new THREE.DirectionalLight(0xffffff, 1.5);
  light.position.set(3, 5, 4);
  previewScene.add(light);
  previewScene.add(new THREE.GridHelper(8, 10, 0x4a5163, 0x303744));
}
function disposePreviewObject() {
  if (!previewObject) return;
  previewScene.remove(previewObject);
  previewObject.traverse((mesh) => {
    mesh.geometry?.dispose();
    if (mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  });
  previewObject = null;
}
function destroyPreview() {
  disposePreviewObject();
  if (previewRenderer) { previewRenderer.dispose(); previewRenderer = null; previewScene = null; previewCamera = null; }
}
async function renderModel(file, canvas) {
  initPreview();
  let object;
  const ext = file.name.toLowerCase().split('.').pop();
  const buffer = await file.arrayBuffer();
  if (['ydd', 'ydr', 'yft'].includes(ext)) {
    const parsed = await parseDrawableFile(buffer, file.name);
    object = parsed.object;
  } else if (ext === 'xml') object = parseCodeWalkerXml(new TextDecoder().decode(buffer));
  else if (['glb', 'gltf'].includes(ext)) object = (await new GLTFLoader().parseAsync(buffer, '')).scene;
  else if (ext === 'obj') object = new OBJLoader().parse(new TextDecoder().decode(buffer));
  else if (ext === 'fbx') object = new FBXLoader().parse(buffer, '');
  else throw new Error(`ไม่รองรับ .${ext}`);
  object.traverse((mesh) => { if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone(); });
  disposePreviewObject();
  previewObject = object;
  previewScene.add(object);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const center = box.getCenter(new THREE.Vector3());
  const distance = size * 0.7 / Math.sin(THREE.MathUtils.degToRad(previewCamera.fov) / 2);
  previewCamera.position.copy(center).add(new THREE.Vector3(0.4, 0.5, 1).normalize().multiplyScalar(distance));
  previewCamera.lookAt(center);
  previewCamera.near = size / 500;
  previewCamera.far = Math.max(size * 10, distance * 3);
  previewCamera.updateProjectionMatrix();
  const w = canvas.width, h = canvas.height;
  previewRenderer.setSize(w, h, false);
  previewRenderer.render(previewScene, previewCamera);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(previewRenderer.domElement, 0, 0);
}

let lastSavedState = null;
function openModelPicker({ getModels, onLoad, onFolderReselect }) {
  const models = getModels();
  let dialog = document.getElementById('modelPickerDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'modelPickerDialog';
    dialog.className = 'model-picker-dialog';
    dialog.innerHTML = `<form method="dialog">
      <div class="dialog-heading"><h2>เลือกโมเดล</h2><button type="submit" class="icon-button" aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
      <div class="picker-body">
        <div class="picker-search"><input type="search" id="modelSearch" placeholder="ค้นหาชื่อโมเดล..." /></div>
        <div class="picker-main">
          <ul id="modelPickerList" class="picker-list asset-list"></ul>
          <div class="picker-preview">
            <canvas id="modelPreview" width="200" height="200"></canvas>
            <p id="modelPreviewName" class="asset-name"></p>
            <p id="modelPreviewPath" class="muted"></p>
          </div>
        </div>
      </div>
      <div class="dialog-actions"><button type="button" id="modelPickerFolder" class="text-button">เปลี่ยนโฟลเดอร์</button><button type="button" id="modelPickerLoad" class="primary" disabled>โหลดโมเดลนี้</button><button type="submit">ปิด</button></div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('form').addEventListener('submit', (event) => {
      if (event.submitter?.type === 'submit') { dialog.close(); event.preventDefault(); }
    });
    dialog.querySelector('#modelPickerFolder').onclick = onFolderReselect;
    dialog.querySelector('#modelSearch').addEventListener('input', () => renderList());
    let selectedFile = null;
    dialog.querySelector('#modelPickerList').addEventListener('click', async (event) => {
      const button = event.target.closest('button'); if (!button) return;
      dialog.querySelectorAll('#modelPickerList button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      selectedFile = button.__file;
      dialog.querySelector('#modelPickerLoad').disabled = false;
      dialog.querySelector('#modelPreviewName').textContent = selectedFile.name;
      dialog.querySelector('#modelPreviewPath').textContent = (selectedFile.webkitRelativePath || selectedFile.name).replace(/^[^/]+\//, '');
      const preview = dialog.querySelector('#modelPreview');
      const ctx = preview.getContext('2d');
      ctx.fillStyle = '#1b1e25'; ctx.fillRect(0, 0, preview.width, preview.height);
      ctx.fillStyle = '#a5adbf'; ctx.font = '12px "Prompt", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('กำลังโหลด...', preview.width / 2, preview.height / 2);
      try { await renderModel(selectedFile, preview); }
      catch (err) { ctx.fillStyle = '#1b1e25'; ctx.fillRect(0, 0, preview.width, preview.height); ctx.fillStyle = '#ffb0b0'; ctx.fillText('โหลด preview ไม่ได้', preview.width / 2, preview.height / 2); }
    });
    dialog.querySelector('#modelPickerLoad').onclick = () => {
      if (!selectedFile) return;
      onLoad(selectedFile);
      dialog.close();
    };
  }
  const searchInput = dialog.querySelector('#modelSearch');
  const list = dialog.querySelector('#modelPickerList');
  const loadBtn = dialog.querySelector('#modelPickerLoad');
  const preview = dialog.querySelector('#modelPreview');
  const previewName = dialog.querySelector('#modelPreviewName');
  const previewPath = dialog.querySelector('#modelPreviewPath');

  function renderList() {
    const q = searchInput.value.toLowerCase();
    const filtered = models.filter((f) => f.name.toLowerCase().includes(q));
    list.replaceChildren();
    if (!filtered.length) { list.append(Object.assign(document.createElement('li'), { className: 'list-empty', textContent: q ? 'ไม่พบโมเดลที่ตรงกับการค้นหา' : 'ยังไม่มีโมเดล — เลือกโฟลเดอร์ก่อน' })); return; }
    const shown = filtered.slice(0, 300);
    for (const file of shown) {
      const row = document.createElement('li'), button = document.createElement('button');
      button.className = 'asset-button'; button.__file = file;
      const info = document.createElement('span'); info.className = 'asset-text';
      const name = document.createElement('span'); name.className = 'asset-name'; name.textContent = file.name;
      const sub = document.createElement('span'); sub.className = 'asset-sub'; sub.textContent = (file.webkitRelativePath || file.name).replace(/^[^/]+\//, '');
      info.append(name, sub); button.append(info); row.append(button); list.append(row);
    }
    if (filtered.length > shown.length) list.append(Object.assign(document.createElement('li'), { className: 'list-empty', textContent: `แสดง ${shown.length} จาก ${filtered.length} — พิมพ์ค้นหาให้เจาะจงขึ้น` }));
  }
  renderList();

  // Reset preview
  const ctx = preview.getContext('2d');
  ctx.fillStyle = '#1b1e25'; ctx.fillRect(0, 0, preview.width, preview.height);
  previewName.textContent = ''; previewPath.textContent = ''; loadBtn.disabled = true;

  // Save/restore scroll position
  if (lastSavedState) { searchInput.value = lastSavedState.query; renderList(); list.scrollTop = lastSavedState.scrollTop || 0; } else { searchInput.value = ''; renderList(); list.scrollTop = 0; }
  dialog.addEventListener('close', () => { lastSavedState = { query: searchInput.value, scrollTop: list.scrollTop }; destroyPreview(); }, { once: true });

  dialog.showModal();
  searchInput.focus();
}

export { openModelPicker };
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'texture-studio-demo-'));
const folder = await mkdtemp(join(tmpdir(), 'gta-folder-test-'));
await writeFile(join(folder, 'box.obj'), `v -0.5 -0.5 -0.5
v 0.5 -0.5 -0.5
v 0.5 0.5 -0.5
v -0.5 0.5 -0.5
v -0.5 -0.5 0.5
v 0.5 -0.5 0.5
v 0.5 0.5 0.5
v -0.5 0.5 0.5
f 1 2 3 4
f 5 6 7 8
f 2 6 7 3
f 1 4 8 5
f 4 3 7 8
f 1 5 6 2
`);
await writeFile(join(folder, 'box.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--remote-debugging-port=9232', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let socket, sequence = 0;
const pending = new Map(), errors = [];
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) { const waiter = pending.get(msg.id); pending.delete(msg.id); if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error))); else waiter.resolve(msg.result); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  };
  return ws;
}
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  let pages;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { pages = await (await fetch('http://127.0.0.1:9232/json/list')).json(); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  if (!pages) throw new Error('Chrome did not start');
  socket = await connect(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5173' });
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if (await evaluate(`document.querySelector('#app') && document.readyState === 'complete'`)) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await evaluate(`var editor, state; (async () => { ({editor,state} = await import(document.querySelector('script[type="module"][src*="/src/main.js"]').src)); })()`);

  assert.ok((await evaluate(`getComputedStyle(document.body).fontFamily`)).includes('Prompt'), 'font-family is Prompt');
  assert.equal(await evaluate(`document.fonts.check('16px Prompt')`), true, 'Prompt font loaded');

  assert.equal(await evaluate(`document.querySelectorAll('#demoList button').length`), 3, '3 demo buttons in panel');
  assert.equal(await evaluate(`document.querySelectorAll('#modelEmptyDemos button').length`), 3, '3 demo buttons in empty 3D view');
  assert.equal(await evaluate(`document.querySelectorAll('#folderInput').length`), 1, 'folder input exists');

  await evaluate(`document.querySelectorAll('#demoList button')[0].click()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate(`state.model?.name`), 'ลังไม้');
  assert.equal(await evaluate(`state.meshes.length`), 1);
  assert.equal(await evaluate(`[...state.textures.values()].some((entry) => entry.name === 'demo-crate')`), true, 'crate texture registered');
  assert.equal(await evaluate(`state.meshes[0].material.map?.image?.width > 0`), true, 'crate material bound to texture');
  assert.equal(await evaluate(`editor.entry?.name`), 'demo-crate', 'crate texture opened in 2D editor');
  assert.equal(await evaluate(`document.getElementById('app').dataset.view`), 'split', 'switched to split view');

  await evaluate(`document.querySelectorAll('#demoList button')[1].click()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate(`state.model?.name`), 'ถังน้ำมัน');
  assert.equal(await evaluate(`Array.isArray(state.meshes[0].material) && state.meshes[0].material.length === 3`), true, 'barrel has 3 material groups');
  assert.equal(await evaluate(`[...state.textures.values()].filter((entry) => entry.name.startsWith('demo-barrel')).length`), 2, 'barrel textures registered');

  await evaluate(`document.querySelectorAll('#demoList button')[2].click()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate(`state.model?.name`), 'รถตัวอย่าง');
  assert.equal(await evaluate(`state.meshes.length`), 6, 'car has 6 meshes');
  assert.equal(await evaluate(`[...state.textures.values()].filter((entry) => entry.name.startsWith('demo-car')).length`), 2, 'car textures registered');

  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#folderInput' });
  assert.ok(nodeId, 'folder input found in DOM');
  await evaluate(`(async () => {
    const objText = 'v -0.5 -0.5 -0.5\\nv 0.5 -0.5 -0.5\\nv 0.5 0.5 -0.5\\nv -0.5 0.5 -0.5\\nv -0.5 -0.5 0.5\\nv 0.5 -0.5 0.5\\nv 0.5 0.5 0.5\\nv -0.5 0.5 0.5\\nf 1 2 3 4\\nf 5 6 7 8\\nf 2 6 7 3\\nf 1 4 8 5\\nf 4 3 7 8\\nf 1 5 6 2\\n';
    const obj = new File([objText], 'box.obj', { type: 'text/plain' });
    Object.defineProperty(obj, 'webkitRelativePath', { value: 'myfolder/box.obj' });
    const png = new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))], 'box.png', { type: 'image/png' });
    Object.defineProperty(png, 'webkitRelativePath', { value: 'myfolder/box.png' });
    await document.getElementById('folderInput').onchange({ target: { files: [obj, png], value: '' } });
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate(`document.querySelectorAll('#folderList button').length`), 1, 'folder list shows 1 model');
  assert.ok((await evaluate(`document.querySelector('#folderList .asset-name').textContent`)) === 'box.obj', 'folder model named box.obj');
  await evaluate(`document.querySelector('#folderList button').click()`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(await evaluate(`state.meshes.length`), 1, 'obj model loaded with 1 mesh');
  assert.equal(await evaluate(`[...state.textures.values()].some((entry) => entry.name === 'box')`), true, 'sibling box.png auto-loaded as texture');
  assert.equal(await evaluate(`document.getElementById('modelEmpty').hidden`), true, '3D empty state hidden');

  await send('Page.captureScreenshot', { format: 'png' }).then(async ({ data }) => { await writeFile('C:/gtav-texture-studio/ui-demo-3d.png', Buffer.from(data, 'base64')); });
  await evaluate(`document.querySelectorAll('#demoList button')[2].click()`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await send('Page.captureScreenshot', { format: 'png' }).then(async ({ data }) => { await writeFile('C:/gtav-texture-studio/ui-demo-car.png', Buffer.from(data, 'base64')); });

  assert.deepEqual(errors, [], `no runtime exceptions: ${errors.join(' | ')}`);
  console.log('PASS: Prompt font, demo models (crate/barrel/car), texture binding, folder scan + sibling texture auto-load, 3D view');
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
}

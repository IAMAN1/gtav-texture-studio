import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'texture-studio-picker-'));
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

  const headings = await evaluate(`[...document.querySelectorAll('#left .section-heading h3')].map(h => h.textContent)`);
  assert.ok(headings.includes('เลือกโมเดล'), '"เลือกโมเดล" heading exists');

  assert.equal(await evaluate(`document.getElementById('openModelPicker').hidden`), true, 'openModelPicker hidden initially');
  assert.equal(await evaluate(`document.getElementById('folderModelCount').textContent`), '', 'folderModelCount empty');

  assert.equal(await evaluate(`document.getElementById('demoList')`), null, 'demoList removed');
  assert.equal(await evaluate(`document.getElementById('modelEmptyDemos')`), null, 'modelEmptyDemos removed');
  assert.equal(await evaluate(`document.getElementById('folderList')`), null, 'folderList removed');
  assert.equal(await evaluate(`document.querySelectorAll('#folderInput').length`), 1, 'folder input exists');

  assert.deepEqual(errors, [], `no runtime exceptions: ${errors.join(' | ')}`);
  console.log('PASS: model picker UI elements, no demo remnants, "เลือกโมเดล" section, zero errors');
} finally {
  try { socket?.close(); } catch {}
  chrome.kill();
}
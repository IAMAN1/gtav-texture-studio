import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'texture-studio-test-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--remote-debugging-port=9231', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
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
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`C:/gtav-texture-studio/${name}.png`, Buffer.from(data, 'base64'));
}
async function drag(x0, y0, x1, y1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
  for (let step = 1; step <= 6; step++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * step / 6, y: y0 + (y1 - y0) * step / 6, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
}
async function imageDrag(tool, x0, y0, x1, y1) {
  const points = await evaluate(`(() => { document.querySelector('[data-tool="${tool}"]').click(); const r = editor.entry.canvas.getBoundingClientRect(); const s = r.width / editor.entry.canvas.width; return [r.left + ${x0}*s, r.top + ${y0}*s, r.left + ${x1}*s, r.top + ${y1}*s]; })()`);
  await drag(...points);
}
try {
  let pages;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { pages = await (await fetch('http://127.0.0.1:9231/json/list')).json(); break; }
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
  assert.equal(await evaluate(`document.querySelectorAll('#viewport canvas').length`), 1);
  assert.equal(await evaluate(`document.querySelectorAll('#newDocument > svg').length`), 1);
  assert.equal(await evaluate(`document.getElementById('undo').disabled`), true);
  await screenshot('ui-desktop');
  await evaluate(`document.getElementById('demoDocument').click()`);
  assert.equal(await evaluate(`editor.entry.layers.length`), 1);
  assert.equal(await evaluate(`document.getElementById('zoomActual').disabled`), false);
  await evaluate(`document.getElementById('addLayer').click(); document.getElementById('color').value='#ff0000'; document.getElementById('size').value='30'`);
  await imageDrag('brush', 250, 250, 450, 250);
  assert.equal(await evaluate(`editor.entry.ctx.getImageData(350,250,1,1).data[0]`), 255);
  await evaluate(`document.getElementById('undo').click()`);
  assert.equal(await evaluate(`editor.layer.canvas.getContext('2d').getImageData(350,250,1,1).data[3]`), 0);
  await evaluate(`document.getElementById('redo').click()`);
  assert.equal(await evaluate(`editor.layer.canvas.getContext('2d').getImageData(350,250,1,1).data[3]`), 255);
  await imageDrag('eraser', 350, 250, 380, 250);
  assert.equal(await evaluate(`editor.layer.canvas.getContext('2d').getImageData(365,250,1,1).data[3]`), 0);
  await imageDrag('rect', 200, 400, 400, 550);
  assert.equal(await evaluate(`editor.entry.layers.length`), 3);
  await evaluate(`document.getElementById('textContent').value='ทดสอบ TEXT';`);
  await imageDrag('text', 180, 660, 180, 660);
  assert.equal(await evaluate(`editor.entry.layers.length`), 4);
  await imageDrag('move', 240, 690, 280, 720);
  assert.equal(await evaluate(`editor.layer.x`), 220);
  await evaluate(`document.getElementById('hue').value=50; document.getElementById('hue').dispatchEvent(new Event('input')); document.getElementById('applyAdjust').click()`);
  assert.equal(await evaluate(`editor.adjust === null && document.getElementById('hue').value === '0'`), true);
  await imageDrag('crop', 100, 100, 900, 850);
  assert.equal(await evaluate(`document.getElementById('selectionActions').hidden`), false);
  await evaluate(`document.getElementById('cropSelection').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width, editor.entry.canvas.height]`), [800,750]);
  await evaluate(`document.getElementById('undo').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width, editor.entry.canvas.height]`), [1024,1024]);
  await evaluate(`document.getElementById('redo').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width, editor.entry.canvas.height]`), [800,750]);
  await evaluate(`document.getElementById('clearSelection').click(); document.getElementById('zoomIn').click(); document.getElementById('zoomFit').click()`);
  await screenshot('ui-editor');
  const engine = await evaluate(`(async () => {
    const {createTextureEntry} = await import('/src/textureEditor.js');
    const c=document.createElement('canvas');c.width=32;c.height=24;const ctx=c.getContext('2d');ctx.fillStyle='#00ff00';ctx.fillRect(0,0,32,24);
    const entry=createTextureEntry('test',c); editor.setEntry(entry);
    document.getElementById('tool').value='fill';document.getElementById('color').value='#ff0000';editor.begin(0,0);editor.end();
    const fill=[...entry.ctx.getImageData(0,0,1,1).data];editor.undo();const undo=[...entry.ctx.getImageData(0,0,1,1).data];editor.redo();
    entry.selection={x:4,y:4,width:8,height:8};editor.copySelection();const copy=[editor.layer.x,editor.layer.y,editor.layer.width,editor.layer.height];
    editor.undo();entry.selection={x:4,y:4,width:8,height:8};editor.deleteSelection(true);const outside=entry.ctx.getImageData(0,0,1,1).data[3];const inside=entry.ctx.getImageData(6,6,1,1).data[3];
    editor.undo();editor.clearSelection();editor.transformDocument('right');const rotation=[entry.canvas.width,entry.canvas.height];editor.undo();editor.resize(64,48);const resized=[entry.canvas.width,entry.canvas.height];editor.undo();
    entry.ytd={};entry.selection={x:0,y:0,width:8,height:8};editor.cropSelection();editor.resize(8,8);const gameSize=[entry.canvas.width,entry.canvas.height];
    editor.clearSelection();entry.ytd=null;editor.changeLayer({locked:true});const locked=editor.begin(5,5);editor.changeLayer({locked:false});editor.changeLayer({visible:false});const hidden=entry.ctx.getImageData(5,5,1,1).data[3];editor.undo();
    const {encodeDDS,decodeDDS}=await import('/src/dds.js');const decoded=decodeDDS(await encodeDDS(entry.ctx.getImageData(0,0,32,24)).arrayBuffer());
    editor.addLayer('continuity');document.getElementById('tool').value='brush';document.getElementById('size').value=4;editor.begin(3,12);editor.last=null;editor.move(15,12,true);editor.end();
    const gap=editor.layer.canvas.getContext('2d').getImageData(9,12,1,1).data[3],resume=editor.layer.canvas.getContext('2d').getImageData(15,12,1,1).data[3];
    editor.begin(3,3);editor.changeLayer({locked:true});editor.move(20,3);editor.end();const lockedStroke=editor.layer.canvas.getContext('2d').getImageData(20,3,1,1).data[3];editor.changeLayer({locked:false});
    editor.addLayer('redo-base');editor.undo();editor.gesture={tool:'rect',x:0,y:0,endX:5,endY:5};editor.redo();const redoAfterShape=entry.redo.length===0;
    document.getElementById('hue').value=50;document.getElementById('hue').dispatchEvent(new Event('input'));document.getElementById('layerOpacity').value=.4;document.getElementById('layerOpacity').dispatchEvent(new Event('input'));document.getElementById('layerOpacity').dispatchEvent(new Event('change'));const opacityAfterAdjust=[editor.layer.opacity,+document.getElementById('layerOpacity').value];
    return {fill,undo,copy,outside,inside,rotation,resized,gameSize,locked,hidden,gap,resume,lockedStroke,redoAfterShape,opacityAfterAdjust,dds:[decoded.width,decoded.height]};
  })()`);
  assert.deepEqual(engine.fill, [255,0,0,255]); assert.deepEqual(engine.undo, [0,255,0,255]);
  assert.deepEqual(engine.copy, [4,4,8,8]); assert.equal(engine.outside,0); assert.equal(engine.inside,255);
  assert.deepEqual(engine.rotation,[24,32]); assert.deepEqual(engine.resized,[64,48]); assert.deepEqual(engine.gameSize,[32,24]);
  assert.equal(engine.locked,false); assert.equal(engine.hidden,0); assert.deepEqual(engine.dds,[32,24]);
  assert.equal(engine.gap,0);assert.equal(engine.resume,255);assert.equal(engine.lockedStroke,0);assert.equal(engine.redoAfterShape,true);assert.deepEqual(engine.opacityAfterAdjust,[.4,.4]);
  console.log('PASS: brush, eraser, shapes, Thai text, move, adjustments, crop, undo/redo, fill, selection copy/delete, transforms, resize, game dimension guard, locking, visibility, DDS roundtrip');
  const fixtures = join(profile, 'fixtures'), downloads = join(profile, 'downloads');
  await mkdir(fixtures); await mkdir(downloads);
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  async function waitFor(expression) {
    for (let attempt=0;attempt<50;attempt++) { if (await evaluate(expression)) return; await new Promise((resolve)=>setTimeout(resolve,100)); }
    throw new Error(`Timed out: ${expression}`);
  }
  async function upload(selector, file) {
    const {root} = await send('DOM.getDocument'); const {nodeId} = await send('DOM.querySelector',{nodeId:root.nodeId,selector});
    await send('DOM.setFileInputFiles',{nodeId,files:[file]});
  }
  async function downloaded(name) {
    const file=join(downloads,name);
    for(let attempt=0;attempt<50;attempt++){try{if((await stat(file)).size>0)return await readFile(file);}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}
    throw new Error(`Download missing: ${name}`);
  }
  const png = await evaluate(`editor.entry.canvas.toDataURL('image/png').split(',')[1]`);
  await writeFile(join(fixtures,'test-image.png'),Buffer.from(png,'base64'));
  await upload('#texInput',join(fixtures,'test-image.png'));
  await waitFor(`editor.entry.name==='test-image' && !document.getElementById('texInput').disabled`);
  assert.equal(await evaluate(`state.textures.size`),2);
  await upload('#stampInput',join(fixtures,'test-image.png'));
  await waitFor(`editor.entry.layers.length===2 && !document.getElementById('stampInput').disabled`);
  assert.equal(await evaluate(`editor.layer.width < editor.entry.canvas.width`),true);
  const layerSize = await evaluate(`[editor.layer.width,editor.layer.height]`);
  const corner = await evaluate(`(() => {const r=editor.entry.canvas.getBoundingClientRect(),s=r.width/editor.entry.canvas.width,l=editor.layer; return [r.left+(l.x+l.width-1)*s,r.top+(l.y+l.height-1)*s,r.left+(l.x+l.width+8)*s,r.top+(l.y+l.height+6)*s]})()`);
  await drag(...corner);
  assert.equal(await evaluate(`editor.layer.width > ${layerSize[0]}`),true);
  await evaluate(`document.getElementById('undo').click()`);
  await evaluate(`document.getElementById('exportPng').click()`);
  assert.equal((await downloaded('test-image.png')).subarray(1,4).toString(),'PNG');
  await evaluate(`document.getElementById('exportJpg').click()`);
  const jpg=await downloaded('test-image.jpg');assert.equal(jpg.readUInt16BE(0),0xffd8);
  await evaluate(`document.getElementById('exportDds').click()`);
  assert.equal((await downloaded('test-image.dds')).subarray(0,4).toString(),'DDS ');
  const ytd = await evaluate(`(async()=>{
    const data=new Uint8Array(1536),d=new DataView(data.buffer),header=new Uint8Array(16),h=new DataView(header.buffer);
    h.setUint32(0,0x37435352,true);h.setUint32(4,13,true);h.setUint32(8,1<<26,true);h.setUint32(12,1<<27,true);
    d.setUint32(0x30,0x50000080,true);d.setUint16(0x38,1,true);d.setUint32(0x80,0x50000100,true);
    d.setUint32(0x128,0x50000200,true);data.set(new TextEncoder().encode('game_diffuse'),0x200);
    d.setUint16(0x150,8,true);d.setUint16(0x152,8,true);d.setUint32(0x158,32,true);data[0x15d]=2;d.setUint32(0x170,0x60000000,true);
    for(let i=1024;i<1344;i+=4){data[i+1]=255;data[i+3]=255;}
    const body=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const file=new Uint8Array(16+body.length);file.set(header);file.set(body,16);return btoa(String.fromCharCode(...file));
  })()`);
  await writeFile(join(fixtures,'test-game.ytd'),Buffer.from(ytd,'base64'));
  await upload('#texInput',join(fixtures,'test-game.ytd'));
  await waitFor(`editor.entry.name==='game_diffuse' && !document.getElementById('texInput').disabled`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width,editor.entry.canvas.height,editor.entry.ytd.textures[0].levels]`),[8,8,2]);
  assert.equal(await evaluate(`document.getElementById('resizeImage').disabled`),true);
  await evaluate(`document.getElementById('tool').value='fill';document.getElementById('color').value='#0000ff';editor.begin(2,2);editor.end();document.getElementById('exportYtd').click()`);
  const gameOutput=await downloaded('test-game.ytd');
  const roundtrip=await evaluate(`(async()=>{const {parseYTD,decodeYTDTexture}=await import('/src/ytd.js');const bytes=Uint8Array.from(atob('${gameOutput.toString('base64')}'),c=>c.charCodeAt(0));const res=await parseYTD(bytes.buffer);return {pixel:[...decodeYTDTexture(res,res.textures[0]).data.slice(0,4)],mip:[...res.data.slice(1280,1284)],name:res.textures[0].name,levels:res.textures[0].levels}})()`);
  assert.deepEqual(roundtrip.pixel,[0,0,255,255]);assert.deepEqual(roundtrip.mip,[0,0,255,255]);assert.equal(roundtrip.name,'game_diffuse');assert.equal(roundtrip.levels,2);
  const resourceGuards=await evaluate(`(async()=>{const {parseYTD,readTextureDict,buildYTD}=await import('/src/ytd.js');const bytes=Uint8Array.from(atob('${gameOutput.toString('base64')}'),c=>c.charCodeAt(0)),res=await parseYTD(bytes.buffer);res.view.setUint16(0x38,2,true);res.view.setUint32(0x88,0x50000100,true);const aliases=readTextureDict(res,0);const deduplicated=res.textures.length===1&&aliases.length===2&&aliases[0]===aliases[1];res.textures[0].entry=editor.entry;res.data=res.data.slice(0,1282);let truncated=false;try{await buildYTD(res);}catch(error){truncated=error.message.includes('mipmap');}return {deduplicated,truncated};})()`);
  assert.deepEqual(resourceGuards,{deduplicated:true,truncated:true});
  const obj='o test-panel\nv -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\n';
  await writeFile(join(fixtures,'test-model.obj'),obj);
  await upload('#modelInput',join(fixtures,'test-model.obj'));
  await waitFor(`state.meshes.length===1 && !document.getElementById('modelInput').disabled`);
  await evaluate(`document.querySelector('#meshList button').click();document.querySelector('#texList button[data-id="'+editor.entry.id+'"]').click()`);
  assert.equal(await evaluate(`state.meshes[0].material.map===editor.entry.texture`),true);
  await evaluate(`state.meshes[0].material.userData.textures.diffuse='test-image'`);
  await upload('#texInput',join(fixtures,'test-image.png'));
  await waitFor(`editor.entry.name==='test-image' && !document.getElementById('texInput').disabled`);
  assert.equal(await evaluate(`state.meshes[0].material.userData.texEntry.name`),'game_diffuse');
  await evaluate(`document.querySelector('#texList button[data-id="'+[...state.textures.values()].find(e=>e.name==='game_diffuse').id+'"]').click();document.getElementById('paint3d').checked=true;document.getElementById('paint3d').dispatchEvent(new Event('change'));document.getElementById('color').value='#ff00ff';document.getElementById('size').value=30;document.getElementById('frameModel').click()`);
  const viewportCenter = await evaluate(`(()=>{const r=document.getElementById('viewport').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  await drag(viewportCenter[0],viewportCenter[1],viewportCenter[0]+5,viewportCenter[1]);
  await screenshot('ui-3d');
  assert.deepEqual(await evaluate(`[...editor.entry.ctx.getImageData(4,4,1,1).data]`),[255,0,255,255]);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:viewportCenter[0],y:viewportCenter[1],button:'left',clickCount:1});
  const miss=await evaluate(`(()=>{const r=document.getElementById('viewport').getBoundingClientRect();return [r.left+2,r.top+2]})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:miss[0],y:miss[1],buttons:1});
  assert.equal(await evaluate(`editor.last===null`),true);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:viewportCenter[0],y:viewportCenter[1],buttons:1});
  assert.equal(await evaluate(`editor.last!==null`),true);
  await evaluate(`document.querySelector('.layer-row.active > button:last-child').click()`);
  assert.equal(await evaluate(`editor.layer.locked && editor.last===null`),true);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:viewportCenter[0],y:viewportCenter[1],button:'left',clickCount:1});
  await evaluate(`document.querySelector('.layer-row.active > button:last-child').click()`);
  console.log('PASS: PNG file upload, image layers, corner resizing, PNG/JPG/DDS downloads, YTD/mip roundtrip, shared texture aliases, incomplete mip rejection, stable material binding, real 3D painting and interrupted stroke guards');
  await evaluate(`document.getElementById('newDocument').click();document.getElementById('newName').value='ui-test';document.getElementById('newWidth').value=256;document.getElementById('newHeight').value=192;document.getElementById('newBackground').value='transparent';document.getElementById('dialogSubmit').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width,editor.entry.canvas.height]`),[256,192]);
  assert.equal(await evaluate(`editor.entry.ctx.getImageData(0,0,1,1).data[3]`),0);
  await evaluate(`document.getElementById('color').value='#00ff00';document.getElementById('shapeFill').checked=true`);
  await imageDrag('ellipse',64,48,192,144);
  assert.deepEqual(await evaluate(`[...editor.entry.ctx.getImageData(128,96,1,1).data]`),[0,255,0,255]);
  await evaluate(`document.activeElement.blur()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});
  assert.equal(await evaluate(`editor.entry.layers.length`),1);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Z',code:'KeyZ',modifiers:10,windowsVirtualKeyCode:90});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Z',code:'KeyZ',modifiers:10,windowsVirtualKeyCode:90});
  assert.equal(await evaluate(`editor.entry.layers.length`),2);
  await evaluate(`document.getElementById('color').value='#000000'`);
  await imageDrag('picker',128,96,128,96);
  assert.equal(await evaluate(`document.getElementById('color').value`),'#00ff00');
  await evaluate(`document.getElementById('resizeImage').click();document.getElementById('newWidth').value=512;document.getElementById('newWidth').dispatchEvent(new Event('input'));document.getElementById('dialogSubmit').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width,editor.entry.canvas.height]`),[512,384]);
  await evaluate(`document.getElementById('undo').click()`);
  assert.deepEqual(await evaluate(`[editor.entry.canvas.width,editor.entry.canvas.height]`),[256,192]);
  await evaluate(`(async()=>{const bytes=Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0)),data=new DataTransfer();data.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));document.activeElement.blur();document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));})()`);
  await waitFor(`editor.entry.layers.length===3 && !document.getElementById('stampInput').disabled`);
  await writeFile(join(fixtures,'broken.png'),'not an image');
  await upload('#texInput',join(fixtures,'broken.png'));
  await waitFor(`!document.getElementById('texInput').disabled && document.querySelector('footer').classList.contains('error')`);
  assert.equal(await evaluate(`editor.entry.name`),'ui-test');
  console.log('PASS: new/resize dialogs, transparent canvas, ellipse, keyboard undo/redo, color picker, clipboard image and corrupt-image recovery');
  await evaluate(`document.querySelector('#texList button[data-id="'+[...state.textures.values()].find(e=>e.name==='studio-sample').id+'"]').click();document.querySelector('[data-tool="brush"]').click()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.getElementById('toggleProperties').click()`);
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),true);
  await screenshot('ui-mobile');
  await evaluate(`document.getElementById('addLayer').click();document.getElementById('toggleProperties').click();document.getElementById('color').value='#0088ff';document.getElementById('size').value=80`);
  const touch = await evaluate(`(()=>{const r=editor.entry.canvas.getBoundingClientRect(),s=r.width/editor.entry.canvas.width;return {x:r.left+400*s,y:r.top+350*s}})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+5,y:touch.y,id:1}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await evaluate(`[...editor.layer.canvas.getContext('2d').getImageData(400,350,1,1).data]`),[0,136,255,255]);
  await send('Emulation.setDeviceMetricsOverride', { width: 812, height: 375, deviceScaleFactor: 1, mobile: true });
  await screenshot('ui-landscape');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: 375px responsive layout without horizontal overflow; zero runtime exceptions');
} finally {
  if (socket?.readyState === 1) { try { await send('Browser.close'); } catch {} socket.close(); }
  else chrome.kill();
}

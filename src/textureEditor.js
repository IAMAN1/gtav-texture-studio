import * as THREE from 'three';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const historyLimit = 64 * 1024 * 1024;
function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}
function copyCanvas(source) {
  const canvas = makeCanvas(source.width, source.height);
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}
function makeLayer(name, canvas) {
  return { id: crypto.randomUUID(), name, canvas, x: 0, y: 0, width: canvas.width, height: canvas.height, opacity: 1, visible: true, locked: false, blend: 'source-over' };
}

export function createTextureEntry(name, source) {
  if (!source.width || !source.height || source.width > 8192 || source.height > 8192 || source.width * source.height > 16777216) throw new Error('รูปต้องไม่เกิน 8192 px ต่อด้าน และไม่เกิน 16 ล้านพิกเซล');
  const canvas = makeCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (source instanceof ImageData) ctx.putImageData(source, 0, 0); else ctx.drawImage(source, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  const layer = makeLayer('ภาพต้นฉบับ', copyCanvas(canvas));
  return { id: crypto.randomUUID(), name, canvas, ctx, texture, original: ctx.getImageData(0, 0, canvas.width, canvas.height), layers: [layer], activeLayerId: layer.id, selection: null, undo: [], redo: [], edited: false };
}

const fract = (v) => ((v % 1) + 1) % 1;

export class TextureEditor {
  constructor({ wrap, ui, onChange, onStatus }) {
    this.wrap = wrap; this.ui = ui; this.onChange = onChange; this.onStatus = onStatus;
    this.entry = null; this.gesture = null; this.adjust = null; this.spaceHeld = false;
    this.zoom = 1; this.panX = 0; this.panY = 0; this.autoFit = true;
    this.stage = document.createElement('div'); this.stage.className = 'canvas-stage';
    this.overlay = makeCanvas(1, 1); this.overlay.className = 'editor-overlay';
    wrap.addEventListener('pointerdown', (e) => this.pointerDown(e));
    wrap.addEventListener('pointermove', (e) => this.pointerMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) wrap.addEventListener(type, () => this.end());
    wrap.addEventListener('wheel', (e) => {
      if (!this.entry) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = wrap.getBoundingClientRect();
        this.setZoom(this.zoom * Math.exp(-e.deltaY * .002), e.clientX - r.left, e.clientY - r.top);
      } else { this.autoFit = false; this.panX -= e.deltaX; this.panY -= e.deltaY; this.updateView(); }
    }, { passive: false });
    new ResizeObserver(() => { if (this.entry && this.autoFit) this.fit(); }).observe(wrap);
  }
  get s() { return { tool: this.ui.tool.value, color: this.ui.color.value, size: +this.ui.size.value, opacity: +this.ui.opacity.value }; }
  get layer() { return this.entry?.layers.find((l) => l.id === this.entry.activeLayerId); }
  get selection() { return this.entry?.selection; }
  setEntry(entry) {
    if (this.entry === entry) return;
    this.end(); this.commitAdjust(); this.entry = entry;
    this.wrap.replaceChildren(this.stage); this.stage.replaceChildren(entry.canvas, this.overlay);
    entry.canvas.setAttribute('aria-label', `ภาพ ${entry.name} — ใช้เครื่องมือเพื่อแก้ไข`);
    this.render(); this.fit(); this.onChange?.('all');
  }
  fit() {
    if (!this.entry || !this.wrap.clientWidth || !this.wrap.clientHeight) return;
    this.autoFit = true;
    this.zoom = clamp(Math.min((this.wrap.clientWidth - 64) / this.entry.canvas.width, (this.wrap.clientHeight - 64) / this.entry.canvas.height, 1), .02, 8);
    this.panX = (this.wrap.clientWidth - this.entry.canvas.width * this.zoom) / 2;
    this.panY = (this.wrap.clientHeight - this.entry.canvas.height * this.zoom) / 2;
    this.updateView();
  }
  setZoom(value, x = this.wrap.clientWidth / 2, y = this.wrap.clientHeight / 2) {
    if (!this.entry) return;
    value = clamp(value, .02, 16); const ratio = value / this.zoom;
    this.panX = x - (x - this.panX) * ratio; this.panY = y - (y - this.panY) * ratio;
    this.zoom = value; this.autoFit = false; this.updateView();
  }
  updateView() {
    if (!this.entry) return;
    this.stage.style.width = `${this.entry.canvas.width}px`; this.stage.style.height = `${this.entry.canvas.height}px`;
    this.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.drawOverlay(); this.onChange?.('view');
  }
  coordinates(e) {
    const r = this.wrap.getBoundingClientRect();
    return [(e.clientX - r.left - this.panX) / this.zoom, (e.clientY - r.top - this.panY) / this.zoom];
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.entry.canvas.width && y < this.entry.canvas.height; }
  editable() {
    if (!this.layer || this.layer.locked || !this.layer.visible) { this.onStatus?.('เลเยอร์ถูกล็อกหรือซ่อนอยู่ — ปลดล็อก/แสดงเลเยอร์ก่อน', true); return false; }
    return true;
  }
  pointerDown(e) {
    if (!this.entry || this.gesture || (e.button !== 0 && e.button !== 1)) return;
    const [x, y] = this.coordinates(e), tool = this.s.tool;
    if (this.spaceHeld || tool === 'hand' || e.button === 1) this.gesture = { tool: 'hand', clientX: e.clientX, clientY: e.clientY, panX: this.panX, panY: this.panY };
    else if (!this.inside(x, y)) return;
    else if (tool === 'select' || tool === 'crop') { this.commitAdjust(); this.entry.selection = null; this.gesture = { tool, x, y }; }
    else if (tool === 'move') {
      this.commitAdjust(); if (!this.editable()) return;
      const l = this.layer;
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      const corner = corners.find(([sx, sy]) => Math.hypot(x - (l.x + (sx > 0 ? l.width : 0)), y - (l.y + (sy > 0 ? l.height : 0))) < 10 / this.zoom);
      this.gesture = { tool, x, y, layerX: l.x, layerY: l.y, layerWidth: l.width, layerHeight: l.height, corner, changed: false };
    } else if (tool === 'rect' || tool === 'ellipse') { this.commitAdjust(); this.gesture = { tool, x, y, endX: x, endY: y }; }
    else if (tool === 'text') { this.addText(x, y); return; }
    else if (tool === 'stamp') { this.ui.stampInput.click(); return; }
    else { if (!this.begin(x, y)) return; this.gesture = { tool, x, y }; }
    e.preventDefault(); this.wrap.setPointerCapture(e.pointerId); this.drawOverlay();
  }
  pointerMove(e) {
    const g = this.gesture; if (!g) return;
    if (g.tool === 'hand') { this.autoFit = false; this.panX = g.panX + e.clientX - g.clientX; this.panY = g.panY + e.clientY - g.clientY; this.updateView(); return; }
    const [x, y] = this.coordinates(e);
    if (g.tool === 'select' || g.tool === 'crop') { this.entry.selection = this.rectangle(g.x, g.y, x, y); this.drawOverlay(); this.onChange?.('selection'); }
    else if (g.tool === 'move') {
      if (!g.changed && Math.hypot(x - g.x, y - g.y) * this.zoom < 3) return;
      if (!g.changed) { this.pushUndo(); g.changed = true; }
      if (g.corner) {
        const [sx, sy] = g.corner, anchorX = g.layerX + (sx < 0 ? g.layerWidth : 0), anchorY = g.layerY + (sy < 0 ? g.layerHeight : 0);
        let width = clamp((x - anchorX) * sx, 1, 8192), height = clamp((y - anchorY) * sy, 1, 8192);
        if (this.ui.layerRatio.checked) {
          const ratio = g.layerWidth / g.layerHeight;
          if (Math.abs(width / g.layerWidth - 1) > Math.abs(height / g.layerHeight - 1)) height = width / ratio; else width = height * ratio;
        }
        Object.assign(this.layer, { x: Math.round(sx < 0 ? anchorX - width : anchorX), y: Math.round(sy < 0 ? anchorY - height : anchorY), width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
      } else { this.layer.x = Math.round(g.layerX + x - g.x); this.layer.y = Math.round(g.layerY + y - g.y); }
      this.render(true);
    } else if (g.tool === 'rect' || g.tool === 'ellipse') { g.endX = clamp(x, 0, this.entry.canvas.width); g.endY = clamp(y, 0, this.entry.canvas.height); this.drawOverlay(); }
    else this.move(x, y);
  }
  rectangle(x0, y0, x1, y1) {
    const w = this.entry.canvas.width, h = this.entry.canvas.height;
    const x = clamp(Math.floor(Math.min(x0, x1)), 0, w), y = clamp(Math.floor(Math.min(y0, y1)), 0, h);
    return { x, y, width: clamp(Math.ceil(Math.max(x0, x1)), 0, w) - x, height: clamp(Math.ceil(Math.max(y0, y1)), 0, h) - y };
  }
  paintUV(entry, uv, phase) {
    this.setEntry(entry);
    const x = fract(uv.x) * entry.canvas.width, y = clamp((1 - fract(uv.y)) * entry.canvas.height, 0, entry.canvas.height - .001);
    if (phase === 'down') return this.begin(x, y);
    this.move(x, y, true); return true;
  }
  begin(x, y) {
    if (!this.entry) return false;
    this.commitAdjust();
    if (this.s.tool === 'picker') { this.pick(x, y); return true; }
    if (!['brush', 'eraser', 'fill'].includes(this.s.tool)) { this.onStatus?.('ระบายบนโมเดลด้วยแปรง ยางลบ เทสี หรือดูดสีเท่านั้น', true); return false; }
    if (!this.editable()) return false;
    this.pushUndo();
    if (this.s.tool === 'fill') this.fill(x, y); else { this.stroke(x, y, x, y); this.last = [x, y]; }
    this.render(true); return true;
  }
  move(x, y, breakOnJump = false) {
    if (!this.editable()) { this.end(); return; }
    if (!this.last && (!breakOnJump || !['brush', 'eraser'].includes(this.s.tool))) return;
    const [lx, ly] = this.last || [x, y];
    if (breakOnJump && Math.hypot(x - lx, y - ly) > Math.max(64, this.s.size * 4)) this.stroke(x, y, x, y); else this.stroke(lx, ly, x, y);
    this.last = [x, y]; this.render(true);
  }
  end() {
    const g = this.gesture; this.gesture = null; this.last = null;
    if (g?.tool === 'rect' || g?.tool === 'ellipse') this.addShape(g);
    if (this.selection && (!this.selection.width || !this.selection.height)) this.entry.selection = null;
    if (g) { this.drawOverlay(); this.onChange?.('all'); }
  }
  layerContext() {
    const l = this.layer, ctx = l.canvas.getContext('2d', { willReadFrequently: true });
    ctx.save(); ctx.setTransform(l.canvas.width / l.width, 0, 0, l.canvas.height / l.height, -l.x * l.canvas.width / l.width, -l.y * l.canvas.height / l.height);
    if (this.selection) { const r = this.selection; ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip(); }
    return ctx;
  }
  stroke(x0, y0, x1, y1) {
    const ctx = this.layerContext(), s = this.s;
    ctx.globalAlpha = s.opacity; ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath();
    if (x0 === x1 && y0 === y1) { ctx.arc(x1, y1, s.size / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    ctx.restore();
  }
  pick(x, y) {
    const c = this.entry.canvas, d = this.entry.ctx.getImageData(clamp(x | 0, 0, c.width - 1), clamp(y | 0, 0, c.height - 1), 1, 1).data;
    this.ui.color.value = '#' + [...d.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join(''); this.onChange?.('color');
  }
  fill(worldX, worldY) {
    const l = this.layer, w = l.canvas.width, h = l.canvas.height;
    const x = Math.floor((worldX - l.x) * w / l.width), y = Math.floor((worldY - l.y) * h / l.height);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const ctx = l.canvas.getContext('2d', { willReadFrequently: true }), img = ctx.getImageData(0, 0, w, h), d = img.data;
    const i0 = (y * w + x) * 4, target = d.slice(i0, i0 + 4), rgb = [1, 3, 5].map((i) => parseInt(this.s.color.slice(i, i + 2), 16));
    const seen = new Uint8Array(w * h), stack = [y * w + x], tol = +this.ui.tolerance.value; seen[stack[0]] = 1;
    while (stack.length) {
      const p = stack.pop(), i = p * 4, px = p % w, py = Math.floor(p / w), wx = l.x + px * l.width / w, wy = l.y + py * l.height / h, r = this.selection;
      if (r && (wx < r.x || wy < r.y || wx >= r.x + r.width || wy >= r.y + r.height)) continue;
      if (Math.max(...target.map((v, c) => Math.abs(d[i + c] - v))) > tol) continue;
      const sa = this.s.opacity, da = d[i + 3] / 255, a = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) d[i + c] = (rgb[c] * sa + d[i + c] * da * (1 - sa)) / a;
      d[i + 3] = a * 255;
      const neighbors = [];
      if (px > 0) neighbors.push(p - 1); if (px < w - 1) neighbors.push(p + 1);
      if (py > 0) neighbors.push(p - w); if (py < h - 1) neighbors.push(p + w);
      for (const n of neighbors) if (!seen[n]) { seen[n] = 1; stack.push(n); }
    }
    ctx.putImageData(img, 0, 0);
  }
  addLayer(name = 'เลเยอร์ใหม่', source = null) {
    if (!this.entry) return;
    if (this.entry.layers.length >= 24) { this.onStatus?.('เพิ่มได้สูงสุด 24 เลเยอร์ต่อรูป', true); return; }
    this.commitAdjust(); this.pushUndo();
    const canvas = source ? copyCanvas(source) : makeCanvas(this.entry.canvas.width, this.entry.canvas.height), l = makeLayer(name, canvas);
    if (source) {
      const scale = Math.min(this.entry.canvas.width * .7 / source.width, this.entry.canvas.height * .7 / source.height, 1);
      l.width = Math.max(1, Math.round(source.width * scale)); l.height = Math.max(1, Math.round(source.height * scale));
      l.x = Math.round((this.entry.canvas.width - l.width) / 2); l.y = Math.round((this.entry.canvas.height - l.height) / 2);
    }
    this.entry.layers.push(l); this.entry.activeLayerId = l.id; this.render(true); this.onChange?.('all'); return l;
  }
  selectLayer(id) { this.end(); this.commitAdjust(); this.entry.activeLayerId = id; this.drawOverlay(); this.onChange?.('all'); }
  changeLayer(values, id = this.entry?.activeLayerId) {
    if (!this.entry) return;
    this.end(); this.commitAdjust(); const l = this.entry.layers.find((item) => item.id === id); if (!l) return;
    if (l.locked && Object.keys(values).some((k) => k !== 'locked' && k !== 'visible')) { this.onStatus?.('ปลดล็อกเลเยอร์ก่อนปรับแต่ง', true); this.onChange?.('all'); return; }
    this.pushUndo(); Object.assign(l, values); this.render(true); this.onChange?.('all');
  }
  duplicateLayer() {
    if (!this.entry) return;
    if (this.selection) { this.copySelection(); return; }
    if (this.entry.layers.length >= 24) { this.onStatus?.('เพิ่มได้สูงสุด 24 เลเยอร์ต่อรูป', true); return; }
    this.commitAdjust(); this.pushUndo();
    const l = { ...this.layer, id: crypto.randomUUID(), name: `${this.layer.name} สำเนา`, canvas: copyCanvas(this.layer.canvas), locked: false };
    this.entry.layers.splice(this.entry.layers.indexOf(this.layer) + 1, 0, l); this.entry.activeLayerId = l.id; this.render(true); this.onChange?.('all');
  }
  deleteLayer() {
    if (!this.entry || !this.editable()) return;
    if (this.entry.layers.length === 1) { this.onStatus?.('ต้องเหลืออย่างน้อย 1 เลเยอร์ ใช้ยางลบเพื่อลบภาพ', true); return; }
    this.commitAdjust(); this.pushUndo(); const i = this.entry.layers.indexOf(this.layer);
    this.entry.layers.splice(i, 1); this.entry.activeLayerId = this.entry.layers[Math.max(0, i - 1)].id; this.render(true); this.onChange?.('all');
  }
  reorderLayer(direction) {
    if (!this.entry || !this.editable()) return;
    const i = this.entry.layers.indexOf(this.layer), next = i + direction; if (next < 0 || next >= this.entry.layers.length) return;
    this.commitAdjust(); this.pushUndo(); [this.entry.layers[i], this.entry.layers[next]] = [this.entry.layers[next], this.entry.layers[i]];
    this.render(true); this.onChange?.('all');
  }
  addText(x, y) {
    const text = this.ui.textContent.value.trim();
    if (!text) { this.ui.textContent.focus(); this.onStatus?.('พิมพ์ข้อความในแผงปรับแต่งก่อน แล้วคลิกตำแหน่งบนรูป', true); return; }
    const size = clamp(+this.ui.fontSize.value || 48, 8, 512), font = `${this.ui.fontWeight.value} ${size}px ${this.ui.fontFamily.value}`;
    const measure = makeCanvas(1, 1).getContext('2d'); measure.font = font;
    const lines = text.split('\n').slice(0, 20), w = Math.min(4096, Math.ceil(Math.max(...lines.map((line) => measure.measureText(line).width)) + size * .4));
    const canvas = makeCanvas(Math.max(1, w), Math.min(4096, Math.ceil(lines.length * size * 1.4 + size * .4))), ctx = canvas.getContext('2d');
    ctx.font = font; ctx.fillStyle = this.s.color; ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, size * .2, size * .2 + i * size * 1.4));
    const l = this.addLayer(text.slice(0, 24), canvas); if (!l) return;
    Object.assign(l, { x: Math.round(x), y: Math.round(y), width: canvas.width, height: canvas.height, opacity: this.s.opacity }); this.render(true); this.onChange?.('all');
  }
  shapePath(ctx, tool, x, y, w, h) {
    ctx.beginPath(); if (tool === 'rect') ctx.rect(x, y, w, h); else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }
  addShape(g) {
    const r = this.rectangle(g.x, g.y, g.endX, g.endY); if (r.width < 2 || r.height < 2) return;
    const padding = this.ui.shapeFill.checked ? 0 : this.s.size / 2;
    const bounds = this.rectangle(r.x - padding, r.y - padding, r.x + r.width + padding, r.y + r.height + padding);
    const canvas = makeCanvas(bounds.width, bounds.height), ctx = canvas.getContext('2d');
    ctx.translate(-bounds.x, -bounds.y); ctx.fillStyle = ctx.strokeStyle = this.s.color; ctx.lineWidth = this.s.size;
    const s = this.selection; if (s) { ctx.beginPath(); ctx.rect(s.x, s.y, s.width, s.height); ctx.clip(); }
    this.shapePath(ctx, g.tool, r.x, r.y, r.width, r.height); if (this.ui.shapeFill.checked) ctx.fill(); else ctx.stroke();
    const l = this.addLayer(g.tool === 'rect' ? 'สี่เหลี่ยม' : 'วงกลม', canvas); if (!l) return;
    Object.assign(l, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, opacity: this.s.opacity }); this.render(true); this.onChange?.('all');
  }
  previewAdjust(hue, sat, bri, contrast = 0) {
    if (!this.entry || !this.editable()) return;
    this.adjust = { layerId: this.layer.id, filter: `hue-rotate(${hue}deg) saturate(${100 + sat}%) brightness(${100 + bri}%) contrast(${100 + contrast}%)` };
    this.render(); this.onChange?.('adjust');
  }
  resetAdjustControls() { for (const id of ['hue', 'sat', 'bri', 'contrast']) this.ui[id].value = 0; }
  commitAdjust() {
    if (!this.adjust || !this.entry) return;
    const l = this.entry.layers.find((item) => item.id === this.adjust.layerId); this.pushUndo();
    const canvas = makeCanvas(l.canvas.width, l.canvas.height), ctx = canvas.getContext('2d'); ctx.filter = this.adjust.filter; ctx.drawImage(l.canvas, 0, 0);
    l.canvas = canvas; this.adjust = null; this.resetAdjustControls(); this.render(true); this.onChange?.('all');
  }
  cancelAdjust() { this.adjust = null; this.resetAdjustControls(); this.render(); this.onChange?.('all'); }
  applyFilter(filter) {
    if (!this.entry || !this.editable()) return;
    this.commitAdjust(); this.adjust = { layerId: this.layer.id, filter }; this.commitAdjust();
  }
  clearSelection() { if (!this.entry) return; this.entry.selection = null; this.drawOverlay(); this.onChange?.('selection'); }
  copySelection() {
    if (!this.entry || !this.selection) return;
    this.commitAdjust(); const r = { ...this.selection }, canvas = makeCanvas(r.width, r.height);
    canvas.getContext('2d').drawImage(this.entry.canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const l = this.addLayer('พื้นที่ที่เลือก', canvas); if (!l) return;
    Object.assign(l, { x: r.x, y: r.y, width: r.width, height: r.height }); this.entry.selection = null; this.render(true); this.onChange?.('all');
  }
  cropSelection() {
    if (!this.entry || !this.selection) return;
    if (this.entry.ytd) { this.onStatus?.('Texture เกมต้องคงขนาดเดิม — ใช้ “ลบนอกพื้นที่” แทนการตัดขนาดภาพ', true); return; }
    this.commitAdjust(); this.pushUndo(); const r = this.selection;
    for (const l of this.entry.layers) { l.x -= r.x; l.y -= r.y; }
    this.entry.canvas.width = r.width; this.entry.canvas.height = r.height; this.entry.selection = null;
    this.render(true); this.fit(); this.onChange?.('all'); this.onStatus?.(`ตัดรูปเป็น ${r.width} × ${r.height} px แล้ว — Ctrl+Z เพื่อย้อนกลับ`);
  }
  deleteSelection(outside = false) {
    if (!this.entry || !this.selection || !this.editable()) return;
    this.commitAdjust(); this.pushUndo(); const r = this.selection, l = this.layer;
    const canvas = makeCanvas(l.canvas.width, l.canvas.height), ctx = canvas.getContext('2d'); ctx.drawImage(l.canvas, 0, 0);
    ctx.globalCompositeOperation = outside ? 'destination-in' : 'destination-out';
    ctx.fillRect((r.x - l.x) * canvas.width / l.width, (r.y - l.y) * canvas.height / l.height, r.width * canvas.width / l.width, r.height * canvas.height / l.height);
    l.canvas = canvas; this.entry.selection = null; this.render(true); this.onChange?.('all');
    this.onStatus?.(outside ? 'ลบนอกพื้นที่บนเลเยอร์ที่เลือกแล้ว' : 'ลบพื้นที่บนเลเยอร์ที่เลือกแล้ว');
  }
  resize(width, height) {
    if (!this.entry) return;
    if (this.entry.ytd) { this.onStatus?.('Texture เกมต้องคงขนาดต้นฉบับ', true); return; }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) return;
    this.commitAdjust(); this.pushUndo(); const sx = width / this.entry.canvas.width, sy = height / this.entry.canvas.height;
    for (const l of this.entry.layers) { l.x *= sx; l.y *= sy; l.width *= sx; l.height *= sy; }
    this.entry.canvas.width = width; this.entry.canvas.height = height; this.entry.selection = null;
    this.render(true); this.fit(); this.onChange?.('all');
  }
  transformDocument(action) {
    if (!this.entry) return;
    const w = this.entry.canvas.width, h = this.entry.canvas.height, rotate = action === 'left' || action === 'right';
    if (rotate && this.entry.ytd && w !== h) { this.onStatus?.('หมุน Texture เกมที่ไม่ใช่สี่เหลี่ยมจัตุรัสไม่ได้ เพราะขนาดจะเปลี่ยน', true); return; }
    this.commitAdjust(); this.pushUndo();
    for (const l of this.entry.layers) {
      const source = l.canvas, canvas = makeCanvas(rotate ? source.height : source.width, rotate ? source.width : source.height), ctx = canvas.getContext('2d');
      const { x, y, width: lw, height: lh } = l;
      if (action === 'right') { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); l.x = h - y - lh; l.y = x; }
      else if (action === 'left') { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); l.x = y; l.y = w - x - lw; }
      else if (action === 'horizontal') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); l.x = w - x - lw; }
      else { ctx.translate(0, canvas.height); ctx.scale(1, -1); l.y = h - y - lh; }
      ctx.drawImage(source, 0, 0); l.canvas = canvas; if (rotate) { l.width = lh; l.height = lw; }
    }
    if (rotate) { this.entry.canvas.width = h; this.entry.canvas.height = w; }
    this.entry.selection = null; this.render(true); this.fit(); this.onChange?.('all');
  }
  snapshot() {
    const e = this.entry;
    return { width: e.canvas.width, height: e.canvas.height, activeLayerId: e.activeLayerId, selection: e.selection ? { ...e.selection } : null, layers: e.layers.map(({ canvas, ...l }) => ({ ...l, pixels: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height) })) };
  }
  trimHistory() {
    const e = this.entry, bytes = (items) => items.reduce((sum, item) => sum + item.layers.reduce((n, l) => n + l.pixels.data.byteLength, 0), 0);
    while (e.undo.length + e.redo.length > 1 && (e.undo.length + e.redo.length > 20 || bytes(e.undo) + bytes(e.redo) > historyLimit)) {
      if (e.undo.length > 1) e.undo.shift(); else if (e.redo.length > 1) e.redo.shift(); else break;
    }
  }
  pushUndo() { if (!this.entry) return; this.entry.undo.push(this.snapshot()); this.entry.redo.length = 0; this.trimHistory(); }
  restore(snapshot) {
    const e = this.entry; e.canvas.width = snapshot.width; e.canvas.height = snapshot.height;
    e.layers = snapshot.layers.map(({ pixels, ...l }) => { const canvas = makeCanvas(pixels.width, pixels.height); canvas.getContext('2d').putImageData(pixels, 0, 0); return { ...l, canvas }; });
    e.activeLayerId = snapshot.activeLayerId; e.selection = snapshot.selection; this.render(true);
    if (this.autoFit) this.fit(); else this.updateView(); this.onChange?.('all');
  }
  undo() {
    if (!this.entry) return; this.end(); if (this.adjust) { this.cancelAdjust(); return; }
    if (!this.entry.undo.length) return;
    this.entry.redo.push(this.snapshot()); this.restore(this.entry.undo.pop()); this.trimHistory();
  }
  redo() {
    if (!this.entry) return; this.end(); this.cancelAdjust();
    if (!this.entry.redo.length) return;
    this.entry.undo.push(this.snapshot()); this.restore(this.entry.redo.pop()); this.trimHistory();
  }
  reset() {
    if (!this.entry) return; this.cancelAdjust(); this.pushUndo(); const o = this.entry.original, canvas = makeCanvas(o.width, o.height);
    canvas.getContext('2d').putImageData(o, 0, 0); const l = makeLayer('ภาพต้นฉบับ', canvas);
    this.entry.layers = [l]; this.entry.activeLayerId = l.id; this.entry.canvas.width = o.width; this.entry.canvas.height = o.height; this.entry.selection = null;
    this.render(true); this.fit(); this.onChange?.('all');
  }
  render(dirty = false) {
    if (!this.entry) return; const { ctx, canvas, layers } = this.entry; ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const l of layers) {
      if (!l.visible) continue; ctx.save(); ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend;
      if (this.adjust?.layerId === l.id) ctx.filter = this.adjust.filter;
      ctx.drawImage(l.canvas, l.x, l.y, l.width, l.height); ctx.restore();
    }
    if (dirty) this.entry.edited = true; this.entry.texture.needsUpdate = true;
    this.stage.style.width = `${canvas.width}px`; this.stage.style.height = `${canvas.height}px`; this.drawOverlay(); this.onChange?.('pixels');
  }
  drawOverlay() {
    if (!this.entry) return; const { width, height } = this.entry.canvas;
    if (this.overlay.width !== width || this.overlay.height !== height) { this.overlay.width = width; this.overlay.height = height; }
    const ctx = this.overlay.getContext('2d'); ctx.clearRect(0, 0, width, height); const s = this.selection;
    if (s) {
      if (this.s.tool === 'crop') { ctx.fillStyle = '#0007'; ctx.fillRect(0, 0, width, height); ctx.clearRect(s.x, s.y, s.width, s.height); }
      ctx.lineWidth = 1 / this.zoom; ctx.strokeStyle = '#fff'; ctx.setLineDash([6 / this.zoom, 4 / this.zoom]); ctx.strokeRect(s.x, s.y, s.width, s.height);
      ctx.strokeStyle = '#24344d'; ctx.lineDashOffset = 6 / this.zoom; ctx.strokeRect(s.x, s.y, s.width, s.height); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    if (this.s.tool === 'move' && this.layer) {
      const l = this.layer; ctx.strokeStyle = '#8aafff'; ctx.lineWidth = 1.5 / this.zoom; ctx.strokeRect(l.x, l.y, l.width, l.height); ctx.fillStyle = '#8aafff';
      for (const [x, y] of [[l.x, l.y], [l.x + l.width, l.y], [l.x, l.y + l.height], [l.x + l.width, l.y + l.height]]) ctx.fillRect(x - 3 / this.zoom, y - 3 / this.zoom, 6 / this.zoom, 6 / this.zoom);
    }
    const g = this.gesture;
    if (g?.tool === 'rect' || g?.tool === 'ellipse') {
      const r = this.rectangle(g.x, g.y, g.endX, g.endY); ctx.globalAlpha = this.s.opacity; ctx.fillStyle = ctx.strokeStyle = this.s.color; ctx.lineWidth = this.s.size;
      this.shapePath(ctx, g.tool, r.x, r.y, r.width, r.height); if (this.ui.shapeFill.checked) ctx.fill(); else ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
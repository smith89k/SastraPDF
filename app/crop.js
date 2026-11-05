// Sastra PDF — Crop pages, as Acrobat's: drag a box on the page, double-click it (or press Enter), and a window shows the
// margins and which pages they go on. A crop only sets the page's /CropBox, so what is cut is hidden, never deleted: zero
// margins bring it back, also after saving. Margins are measured as the page is shown (top = the top of the screen, also on a
// turned page) from the page's full size (/MediaBox), so each chosen page gets the same margins from its own edges.
// The geometry has no DOM, so it is plain-Node testable; index.html hands in the rest through init.
(() => {
'use strict';
const root = typeof window !== 'undefined' ? window : globalThis;
const MIN_SIDE = 14;      // points that must be left of a page (5 mm)
const MIN_BOX = 10;       // screen pixels: less is a slip of the mouse, not a box
const MIN_DRAG = 3;
const EDGE = 28, MAX_STEP = 18;   // screen pixels: how near the view's edge a drag scrolls it, and how fast at most
const UNITS = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1 }, UNIT_NAMES = { mm: 'Millimetres', cm: 'Centimetres', in: 'Inches', pt: 'Points' };
const STORE = 'sastra-crop-unit';
const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }, SIDES = ['top', 'bottom', 'left', 'right'];

/* ---------- geometry ---------- */
const turn = rot => { const r = ((rot % 360) + 360) % 360; return r % 90 ? 0 : r; };
const shownSize = (media, rot) => (turn(rot) % 180 ? { w: media.h, h: media.w } : { w: media.w, h: media.h });
// the page's own edges (left, bottom, right, top of the unturned page) as shown on screen
function marginsOf(media, box, rot) {
  const L = Math.max(0, box.x - media.x), B = Math.max(0, box.y - media.y);
  const R = Math.max(0, media.x + media.w - box.x - box.w), T = Math.max(0, media.y + media.h - box.y - box.h);
  switch (turn(rot)) {
    case 90: return { top: L, right: T, bottom: R, left: B };
    case 180: return { top: B, right: L, bottom: T, left: R };
    case 270: return { top: R, right: B, bottom: L, left: T };
    default: return { top: T, right: R, bottom: B, left: L };
  }
}
function boxFrom(media, m, rot) {
  const r = turn(rot);
  const [L, B, R, T] = r === 90 ? [m.top, m.left, m.bottom, m.right] : r === 180 ? [m.right, m.top, m.left, m.bottom] : r === 270 ? [m.bottom, m.right, m.top, m.left] : [m.left, m.bottom, m.right, m.top];
  return { x: media.x + L, y: media.y + B, w: media.w - L - R, h: media.h - B - T };
}
function fits(media, m, rot) {
  if (!SIDES.every(s => Number.isFinite(m[s]) && m[s] >= 0)) return false;
  const s = shownSize(media, rot);
  return s.w - m.left - m.right >= MIN_SIDE && s.h - m.top - m.bottom >= MIN_SIDE;
}
function pageList({ which, n, current, selected = [], from = 1, to = n, side = 'both' }) {
  const all = which === 'this' ? [current] : which === 'selected' ? [...selected].sort((a, b) => a - b) : which === 'all' ? [...Array(n).keys()] : [...Array(n).keys()].filter(i => i + 1 >= from && i + 1 <= to);
  return all.filter(i => side === 'both' || (side === 'odd' ? i % 2 === 0 : i % 2 === 1));
}
// The box around all that isn't white, in pixels (right and bottom are past the last pixel); null when it is all white.
function inkBounds(data, w, h) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    if (data[k] < 245 || data[k + 1] < 245 || data[k + 2] < 245) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; bottom = y; }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}
const toPts = (v, unit) => v * UNITS[unit];
const show = (pts, unit) => String(Number((pts / UNITS[unit]).toFixed(2)));
// pdf-lib's boxes keep a box written backwards as it is, with a negative size
const plain = b => ({ x: Math.min(b.x, b.x + b.width), y: Math.min(b.y, b.y + b.height), w: Math.abs(b.width), h: Math.abs(b.height) });
const pageInfo = doc => doc.getPages().map(p => ({ media: plain(p.getMediaBox()), crop: plain(p.getCropBox()), rot: turn(p.getRotation().angle) }));
function cropPages(doc, pages, m) {
  for (const i of pages) {
    const p = doc.getPage(i), b = boxFrom(plain(p.getMediaBox()), m, p.getRotation().angle);
    p.setCropBox(b.x, b.y, b.w, b.h);
  }
}
const same = (a, b) => SIDES.every(s => Math.abs(a[s] - b[s]) < 0.01);

/* ---------- on the page ---------- */
let o = null, box = null, drag = null, els = null, panelOpen = false;
const pageEl = i => o.pages.children[i];
function clearEls() { els?.shade.remove(); els?.box.remove(); els = null; }
function drawBox() {
  const el = box && pageEl(box.i);
  if (!el) { clearEls(); return; }
  if (!els || !els.box.isConnected || els.page !== el) {
    clearEls();
    const clip = document.createElement('div'); clip.className = 'crop-clip'; clip.innerHTML = '<i></i>';
    const b = document.createElement('div'); b.className = 'crop-box';
    b.innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="crop-h ${h}" data-h="${h}"></span>`).join('');
    el.append(clip, b);
    els = { page: el, shade: clip, inner: clip.firstChild, box: b };
  }
  const [x0, y0, x1, y1] = box.f;
  for (const t of [els.inner, els.box]) { t.style.left = `${x0 * 100}%`; t.style.top = `${y0 * 100}%`; t.style.width = `${(x1 - x0) * 100}%`; t.style.height = `${(y1 - y0) * 100}%`; }
}
function removeBox() {
  if (!box) return false;
  box = null; clearEls();
  return true;
}
function at(e, el) {
  const r = el.getBoundingClientRect();
  return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
}
function pointerDown(e) {
  if (o.tool() !== 'crop' || e.button !== 0) return false;
  const d = o.active(); if (!d) return false;
  const h = e.target.closest('.crop-h'), inBox = e.target.closest('.crop-box'), pg = e.target.closest('.page');
  if (!pg) return false;
  const i = +pg.dataset.i, a = at(e, pg);
  if (h) drag = { type: 'resize', h: h.dataset.h, i, from: box.f };
  else if (inBox) drag = { type: 'move', i, a, from: box.f };
  else drag = { type: 'new', i, a };
  drag.id = e.pointerId; drag.d = d; drag.far = 0; drag.start = [e.clientX, e.clientY]; drag.el = pg; drag.last = e;
  requestAnimationFrame(autoScroll);
  o.viewer.setPointerCapture(e.pointerId);
  o.viewer.focus({ preventScroll: true });
  e.preventDefault();
  return true;
}
function pointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.el.isConnected) { drag = null; return; }
  drag.last = e;
  drag.far = Math.max(drag.far, Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]));
  dragTo(e);
}
// Most pages are taller than the window: held near an edge the page scrolls, so the box can reach the rest of it, as in Acrobat.
function autoScroll() {
  if (!drag) return;
  const e = drag.last, v = o.viewer, r = v.getBoundingClientRect(), bottom = r.top + v.clientHeight, right = r.left + v.clientWidth;
  const step = (a, lo, hi) => (a > hi - EDGE ? Math.min(MAX_STEP, (a - (hi - EDGE)) / 2 + 2) : a < lo + EDGE ? -Math.min(MAX_STEP, (lo + EDGE - a) / 2 + 2) : 0);
  const t = v.scrollTop, l = v.scrollLeft;
  if (drag.far >= MIN_DRAG) { v.scrollTop += step(e.clientY, r.top, bottom); v.scrollLeft += step(e.clientX, r.left, right); }
  if (v.scrollTop !== t || v.scrollLeft !== l) dragTo(e);
  requestAnimationFrame(autoScroll);
}
function dragTo(e) {
  if (drag.far < MIN_DRAG) return;
  const p = at(e, drag.el), r = drag.el.getBoundingClientRect(), mx = MIN_BOX / r.width, my = MIN_BOX / r.height;
  if (drag.type === 'new') box = { d: drag.d, i: drag.i, f: [Math.min(drag.a[0], p[0]), Math.min(drag.a[1], p[1]), Math.max(drag.a[0], p[0]), Math.max(drag.a[1], p[1])] };
  else if (drag.type === 'move') {
    const [x0, y0, x1, y1] = drag.from, dx = Math.max(-x0, Math.min(1 - x1, p[0] - drag.a[0])), dy = Math.max(-y0, Math.min(1 - y1, p[1] - drag.a[1]));
    box.f = [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
  } else {
    let [x0, y0, x1, y1] = drag.from;
    if (drag.h.includes('w')) x0 = Math.min(p[0], x1 - mx);
    if (drag.h.includes('e')) x1 = Math.max(p[0], x0 + mx);
    if (drag.h.includes('n')) y0 = Math.min(p[1], y1 - my);
    if (drag.h.includes('s')) y1 = Math.max(p[1], y0 + my);
    box.f = [x0, y0, x1, y1];
  }
  drawBox();
}
function pointerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const g = drag; drag = null;
  if (g.type === 'new' && box?.i === g.i && g.far >= MIN_DRAG) {
    const r = g.el.getBoundingClientRect();
    if ((box.f[2] - box.f[0]) * r.width < MIN_BOX || (box.f[3] - box.f[1]) * r.height < MIN_BOX) removeBox();
  }
}
function cancelDrag() {
  if (!drag) return false;
  const g = drag; drag = null;
  if (g.type === 'new') removeBox();
  else if (box) { box.f = g.from; drawBox(); }
  return true;
}
// The box in the page's own coordinates: d.sizes[i].t is the matrix pdf.js draws with, so turned and cropped pages just work.
function boxInPdf(d, i, f) {
  const s = d.sizes[i], [a, b, c, dd, tx, ty] = s.t, det = a * dd - b * c;
  const un = (fx, fy) => { const x = fx * s.w - tx, y = fy * s.h - ty; return [(dd * x - c * y) / det, (a * y - b * x) / det]; };
  const [p, q] = [un(f[0], f[1]), un(f[2], f[3])];
  return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]), h: Math.abs(p[1] - q[1]) };
}

/* ---------- the window ---------- */
const infos = new WeakMap();   // per copy of the file: the sizes don't change until the bytes do
async function infoFor(d) {
  if (!infos.has(d.bytes)) infos.set(d.bytes, pageInfo(await root.PDFLib.PDFDocument.load(d.bytes, { ignoreEncryption: true, updateMetadata: false })));
  return infos.get(d.bytes);
}
// The whole page, with what an earlier crop hides: the page's own getViewport only knows the cropped part.
async function drawWhole(d, i, inf, maxW, maxH, canvas) {
  const page = await d.pdf.getPage(i + 1), size = shownSize(inf.media, inf.rot), scale = Math.min(maxW / size.w, maxH / size.h);
  const Viewport = page.getViewport({ scale: 1 }).constructor;
  const vp = new Viewport({ viewBox: [inf.media.x, inf.media.y, inf.media.x + inf.media.w, inf.media.y + inf.media.h], userUnit: 1, scale, rotation: inf.rot });
  canvas.width = Math.max(1, Math.floor(vp.width)); canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  root.SastraMarks?.paint(ctx, o.marksOn(d, i), vp);
  return ctx;
}
async function openPanel(d, i, useBox) {
  if (panelOpen) return;
  if (o.busy()) { o.toast('Please wait for the current task to finish'); return; }
  panelOpen = true;
  try {
    if (await o.refuse(d)) { o.setTool('select'); return; }
    const info = await infoFor(d);
    if (o.active() !== d) return;
    showPanel(d, i, info, useBox && box?.i === i ? marginsOf(info[i].media, boxInPdf(d, i, box.f), info[i].rot) : null);
  } catch (e) { console.error(e); o.toast(`Couldn't open Crop: ${e?.message || e}`, true); }
  finally { if (!document.querySelector('.crop-panel')) panelOpen = false; }
}
function showPanel(d, i, info, fromBox) {
  const inf = info[i], size = shownSize(inf.media, inf.rot), now = marginsOf(inf.media, inf.crop, inf.rot);
  let m = { ...(fromBox || now) };
  let unit = 'mm'; try { const u = localStorage.getItem(STORE); if (UNITS[u]) unit = u; } catch {}
  const sel = [...d.sel].sort((a, b) => a - b), many = sel.length > 1 && sel.includes(i);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  const field = s => `<div class="field"><label for="cp-${s}">${s[0].toUpperCase() + s.slice(1)}</label><input type="number" id="cp-${s}" data-side="${s}" min="0"></div>`;
  bg.innerHTML = `<div class="modal crop-panel" role="dialog" aria-modal="true" aria-labelledby="cpTitle">
    <h2 id="cpTitle">Crop pages</h2>
    <div class="cp-main">
      <div class="cp-look"><div class="cp-frame"><canvas></canvas><div class="cp-dim"></div></div><div class="cp-cap">Page ${i + 1}</div></div>
      <div class="cp-set">
        <div class="cp-grid">${SIDES.map(field).join('')}</div>
        <div class="field"><label for="cpUnit">Units</label><select id="cpUnit">${Object.entries(UNIT_NAMES).map(([k, v]) => `<option value="${k}"${k === unit ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="cp-btns">
          <button class="btn outline" id="cpWhite">Remove white margins</button>
          <button class="btn outline" id="cpZero">Set to zero</button>
          ${fromBox ? '<button class="btn outline" id="cpBox">Back to my box</button>' : ''}
        </div>
        <fieldset class="cp-pages"><legend class="flabel">Pages</legend>
          <label><input type="radio" name="cpW" value="this"${many ? '' : ' checked'}>This page (${i + 1})</label>
          ${many ? `<label><input type="radio" name="cpW" value="selected" checked>Selected pages (${sel.length})</label>` : ''}
          <label><input type="radio" name="cpW" value="all">All pages (${d.n})</label>
          <label class="cp-range"><input type="radio" name="cpW" value="range">From <input type="number" id="cpFrom" min="1" max="${d.n}" value="1" aria-label="From page"> to <input type="number" id="cpTo" min="1" max="${d.n}" value="${d.n}" aria-label="To page"></label>
          <div class="field"><label for="cpSide">Apply to</label><select id="cpSide"><option value="both">Odd and even pages</option><option value="odd">Odd pages only</option><option value="even">Even pages only</option></select></div>
        </fieldset>
      </div>
    </div>
    <p class="detail" id="cpNote"></p>
    <p class="cp-err" id="cpErr" role="alert" hidden></p>
    <div class="acts"><button class="btn outline" id="cpCancel">Cancel</button><button class="btn primary" id="cpGo">Crop</button></div>
  </div>`;
  const $ = s => bg.querySelector(s), inputs = [...bg.querySelectorAll('[data-side]')], dim = $('.cp-dim');
  const frame = $('.cp-frame'), W = 230, H = 300, k = Math.min(W / size.w, H / size.h);
  frame.style.width = `${Math.floor(size.w * k)}px`; frame.style.height = `${Math.floor(size.h * k)}px`;
  let closed = false;
  const fill = () => { for (const f of inputs) f.value = show(m[f.dataset.side], unit); for (const f of inputs) f.step = unit === 'cm' || unit === 'in' ? '0.1' : '1'; };
  const targets = () => pageList({ which: bg.querySelector('[name=cpW]:checked').value, n: d.n, current: i, selected: sel, from: +$('#cpFrom').value, to: +$('#cpTo').value, side: $('#cpSide').value });
  const problem = t => {
    const whole = SIDES.every(s => Number.isFinite(m[s]) && m[s] >= 0);
    if (!whole) return 'Margins must be numbers, 0 or more.';
    if (!t.length) return 'No pages match that choice.';
    const bad = t.find(j => !fits(info[j].media, m, info[j].rot));
    return bad === undefined ? '' : `Those margins leave too little of page ${bad + 1}.`;
  };
  const check = () => {
    const t = targets(), why = problem(t), err = $('#cpErr');
    err.textContent = why; err.hidden = !why;
    $('#cpGo').disabled = !!why;
    $('#cpGo').textContent = t.length > 1 ? `Crop ${t.length} pages` : 'Crop';
    $('#cpNote').textContent = (t.length > 1 ? 'Each page gets the same margins from its own edges. ' : '') + 'The cut parts are hidden, not deleted. Set to zero brings them back.';
    const ok = Number.isFinite(m.left + m.top + m.right + m.bottom);
    dim.hidden = !ok;
    if (ok) { dim.style.left = `${m.left / size.w * 100}%`; dim.style.top = `${m.top / size.h * 100}%`; dim.style.width = `${Math.max(0, size.w - m.left - m.right) / size.w * 100}%`; dim.style.height = `${Math.max(0, size.h - m.top - m.bottom) / size.h * 100}%`; }
  };
  const done = () => { if (closed) return; closed = true; bg.remove(); document.removeEventListener('keydown', keys, true); panelOpen = false; o.viewer.focus({ preventScroll: true }); };
  const go = async () => {
    const t = targets();
    if (problem(t)) return;
    if (t.every(j => same(marginsOf(info[j].media, info[j].crop, info[j].rot), m))) { done(); removeBox(); o.toast(t.length > 1 ? 'Those pages already have these margins.' : 'This page already has these margins.'); return; }
    done(); removeBox();
    await o.apply(d, t, m, i);
  };
  const keys = e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(); }
    else if (e.key === 'Enter' && e.target.matches('input')) { e.stopPropagation(); e.preventDefault(); go(); }
  };
  bg.addEventListener('input', e => {
    const f = e.target;
    if (f.dataset.side) m = { ...m, [f.dataset.side]: f.value === '' ? 0 : toPts(+f.value, unit) };
    if (f.id === 'cpFrom' || f.id === 'cpTo') bg.querySelector('[value=range]').checked = true;
    check();
  });
  bg.addEventListener('change', e => {
    if (e.target.id === 'cpUnit') { unit = e.target.value; try { localStorage.setItem(STORE, unit); } catch {} fill(); }
    check();
  });
  bg.addEventListener('click', e => { if (e.target === bg) done(); });
  $('#cpCancel').onclick = done;
  $('#cpGo').onclick = go;
  $('#cpZero').onclick = () => { m = { ...ZERO }; fill(); check(); };
  if (fromBox) $('#cpBox').onclick = () => { m = { ...fromBox }; fill(); check(); };
  $('#cpWhite').onclick = async () => {
    const b = $('#cpWhite'), err = $('#cpErr'); b.disabled = true;
    try {
      const c = document.createElement('canvas'), long = Math.min(1400, Math.max(size.w, size.h) * 2);
      const ctx = await drawWhole(d, i, inf, long, long, c);
      if (closed) return;
      const ink = inkBounds(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (!ink) { err.textContent = 'This page is all white, so there is nothing to crop to.'; err.hidden = false; return; }
      const fx = size.w / c.width, fy = size.h / c.height;
      m = { top: ink.top * fy, bottom: (c.height - ink.bottom) * fy, left: ink.left * fx, right: (c.width - ink.right) * fx };
      fill(); check();
    } catch (e) { console.error(e); err.textContent = "Couldn't read this page."; err.hidden = false; }
    finally { if (!closed) b.disabled = false; }
  };
  document.addEventListener('keydown', keys, true);
  document.body.appendChild(bg);
  fill(); check();
  $('#cpGo').focus();
  const dpr = root.devicePixelRatio || 1;
  drawWhole(d, i, inf, frame.clientWidth * dpr, frame.clientHeight * dpr, $('canvas')).catch(e => { if (!closed) console.warn(e); });
}
function enter() {
  if (o.tool() !== 'crop' || !box) return false;
  openPanel(o.active(), box.i, true);
  return true;
}
function dblClick(e) {
  if (o.tool() !== 'crop') return;
  // by the mouse's place, not e.target: the press before it holds the pointer on the viewer, and the double-click lands there
  const under = document.elementFromPoint(e.clientX, e.clientY), d = o.active(), pg = under?.closest('.page');
  if (!d || !pg) return;
  openPanel(d, +pg.dataset.i, !!under.closest('.crop-box'));
}
function toolChanged(t) {
  document.getElementById('oCrop').classList.toggle('on', t === 'crop');
  o.viewer.classList.toggle('cropping', t === 'crop');
  document.getElementById('cropOpts').hidden = t !== 'crop';
  if (t !== 'crop') { drag = null; removeBox(); }
}
// The pages were built again (an edit, undo, another file): a box on them is gone with them.
function sync() { if (box && !els?.box.isConnected) { box = null; els = null; } }

function init(options) {
  o = options;
  o.viewer.addEventListener('pointermove', pointerMove);
  o.viewer.addEventListener('pointerup', pointerUp);
  o.viewer.addEventListener('pointercancel', () => cancelDrag());
  o.viewer.addEventListener('dblclick', dblClick);
  document.getElementById('oCropSet').onclick = () => { const d = o.active(); if (d) openPanel(d, box && box.d === d ? box.i : d.current, !!box); };
  return { pointerDown, removeBox, cancelDrag, enter, toolChanged, sync, dragging: () => !!drag };
}

root.SastraCrop = { init, marginsOf, boxFrom, shownSize, fits, pageList, inkBounds, pageInfo, cropPages, toPts, show };
})();

// Sastra PDF — the Draw tools: highlight, pen and shapes on top of the pages, and changing a mark afterwards (design:
// docs/superpowers/specs/2026-11-05-view-and-marks-design.md). The marks themselves are in marks.js; index.html keeps
// them in d.marks and hands in what this needs. Drawing changes only an SVG over the page, never the file.
(() => {
'use strict';
const M = window.SastraMarks;
const TOOLS = { dHighlight: 'highlight', dPen: 'pen', dRect: 'rect', dEllipse: 'ellipse', dLine: 'line', dArrow: 'arrow' };
const KINDS = Object.values(TOOLS);
const GROUP = { highlight: 'highlight', pen: 'pen', rect: 'shape', ellipse: 'shape', line: 'line', arrow: 'line' };
const NAMES = { highlight: 'Highlight', pen: 'Pen', rect: 'Rectangle', ellipse: 'Circle', line: 'Line', arrow: 'Arrow' };
const DEFAULTS = { highlight: { color: '#ffe14d', width: 14 }, pen: { color: '#d92d20', width: 2 }, shape: { color: '#d92d20', fill: null, width: 2 }, line: { color: '#d92d20', width: 2 } };
const COLORS = ['#000000', '#d92d20', '#f79009', '#fdd835', '#12b76a', '#1570ef', '#7a5af8', '#ffffff'];
const MARKER_COLORS = ['#ffe14d', '#8ce99a', '#74c0fc', '#f783ac', '#ffa94d'];
const WIDTHS = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12], MARKER_WIDTHS = [8, 10, 14, 18, 24];
const STORE = 'sastra-draw';
const MIN_DRAG = 3;   // screen pixels: less is a click, not a shape

let o = null, sel = null, drag = null;
let styles = JSON.parse(JSON.stringify(DEFAULTS));
try { const s = JSON.parse(localStorage.getItem(STORE)); if (s) for (const g of Object.keys(DEFAULTS)) styles[g] = { ...DEFAULTS[g], ...(s[g] || {}) }; } catch {}
const remember = () => { try { localStorage.setItem(STORE, JSON.stringify(styles)); } catch {} };

const isDrawTool = t => KINDS.includes(t);
const pageEl = i => o.pages.children[i];
const selected = d => (sel && d ? d.marks.find(m => m.id === sel) || null : null);

function toPdf(d, i, e) {
  const r = pageEl(i).getBoundingClientRect(), s = d.sizes[i], [a, b, c, dd, tx, ty] = s.t;
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.w - tx, y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * s.h - ty;
  const det = a * dd - b * c;
  return [(dd * x - c * y) / det, (a * y - b * x) / det];
}
function fromPdf(d, i, [x, y]) {
  const s = d.sizes[i], [a, b, c, dd, tx, ty] = s.t;
  return [(a * x + c * y + tx) / s.w, (b * x + dd * y + ty) / s.h];
}

/* ---------- on the page ---------- */
const hitless = m => ({ ...m, color: '#000000', fill: null, width: 1 });
const one = m => `<g data-m="${m.id}"><g class="vis">${M.svg(m)}</g><g class="hit">${M.svg(hitless(m))}</g></g>`;
function overlay(d, i) {
  const el = pageEl(i);
  let svg = el.querySelector(':scope > svg.marks');
  if (!svg) {
    const s = d.sizes[i];
    el.insertAdjacentHTML('beforeend', `<svg class="marks" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none"><g transform="matrix(${s.t.join(' ')})"><g class="ms"></g><g class="pv"></g><g class="sl"></g></g></svg>`);
    svg = el.querySelector(':scope > svg.marks');
  }
  return svg;
}
function syncPage(d, i) {
  const el = pageEl(i); if (!el) return;
  const list = d.marks.filter(m => m.page === i);
  if (!list.length) { el.querySelector(':scope > svg.marks')?.remove(); return; }
  overlay(d, i).querySelector('.ms').innerHTML = list.map(one).join('');
}
function showSelection(d, m) {
  o.pages.querySelectorAll('.mk-h').forEach(h => h.remove());
  o.pages.querySelectorAll('svg.marks .sl').forEach(g => { g.innerHTML = ''; });
  if (!m) return;
  const [x0, y0, x1, y1] = M.bounds(m), el = pageEl(m.page); if (!el) return;
  overlay(d, m.page).querySelector('.sl').innerHTML = `<rect class="mk-sel" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
  M.handles(m).forEach((p, k) => {
    const [fx, fy] = fromPdf(d, m.page, p), h = document.createElement('div');
    h.className = 'mk-h'; h.dataset.h = k; h.style.left = `${fx * 100}%`; h.style.top = `${fy * 100}%`;
    el.appendChild(h);
  });
}
function sync(d) {
  if (!d) { sel = null; renderOptions(); return; }
  const pages = new Set(d.marks.map(m => m.page));
  o.pages.querySelectorAll('svg.marks').forEach(s => { const i = +s.parentElement.dataset.i; if (!pages.has(i)) s.remove(); });
  for (const i of pages) syncPage(d, i);
  if (sel && !selected(d)) { sel = null; renderOptions(); }
  showSelection(d, selected(d));
}
function preview(d, m) { overlay(d, m.page).querySelector('.pv').innerHTML = `<g class="vis">${M.svg(m)}</g>`; }
function clearPreview(d, i) { pageEl(i)?.querySelector(':scope > svg.marks .pv')?.replaceChildren(); }

/* ---------- pointer ---------- */
function pointerDown(e) {
  const d = o.active();
  if (!d || e.button !== 0 || o.maxed()) return false;
  const tool = o.tool();
  // A running job (a rotate, a save) holds the marks as they were: a change now would be lost when it ends.
  if (o.busy() && (isDrawTool(tool) || e.target.closest('.mk-h, [data-m]'))) { o.toast('Please wait for the current task to finish'); return true; }
  if (isDrawTool(tool)) {
    const pg = e.target.closest('.page'); if (!pg) return false;
    if (protectedFile(d)) { canDraw(); o.setTool('select'); return true; }
    const i = +pg.dataset.i, a = toPdf(d, i, e), st = styles[GROUP[tool]];
    drag = { type: 'draw', d, i, a, raw: [a], at: [e.clientX, e.clientY], far: 0, mark: { id: M.newId(), page: i, kind: tool, pts: [a, a], color: st.color, fill: M.isBox(tool) ? st.fill : null, width: st.width } };
    if (tool === 'pen' || tool === 'highlight') drag.mark.pts = [a];
  } else if (tool === 'select') {
    const h = e.target.closest('.mk-h'), hit = e.target.closest('[data-m]');
    if (h) {
      const m = selected(d); if (!m) return false;
      drag = { type: 'resize', d, h: +h.dataset.h, from: m, mark: m, at: [e.clientX, e.clientY], far: 0 };
    } else if (hit) {
      const m = d.marks.find(x => x.id === hit.dataset.m); if (!m) return false;
      select(d, m.id);
      drag = { type: 'move', d, from: m, mark: m, a: toPdf(d, m.page, e), at: [e.clientX, e.clientY], far: 0 };
    } else { deselect(); return false; }
  } else return false;
  o.viewer.setPointerCapture(e.pointerId); drag.id = e.pointerId;
  o.viewer.focus({ preventScroll: true });
  e.preventDefault();
  return true;
}
function pointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag.far = Math.max(drag.far, Math.hypot(e.clientX - drag.at[0], e.clientY - drag.at[1]));
  const { d } = drag;
  if (drag.type === 'draw') {
    const p = toPdf(d, drag.i, e), k = drag.mark.kind;
    if (k === 'pen' || k === 'highlight') {
      drag.raw.push(p);
      drag.mark = { ...drag.mark, pts: e.shiftKey ? [drag.a, M.constrain(k, drag.a, p, true)] : drag.raw };
    } else drag.mark = { ...drag.mark, pts: [drag.a, M.constrain(k, drag.a, p, e.shiftKey)] };
    preview(d, drag.mark);
    return;
  }
  if (drag.far < MIN_DRAG) return;
  if (drag.type === 'move') {
    const p = toPdf(d, drag.from.page, e);
    drag.mark = M.moved(drag.from, p[0] - drag.a[0], p[1] - drag.a[1]);
  } else drag.mark = M.resized(drag.from, drag.h, toPdf(d, drag.from.page, e));
  const g = pageEl(drag.from.page).querySelector(`[data-m="${drag.from.id}"]`);
  if (g) g.style.display = 'none';
  preview(d, drag.mark); showSelection(d, drag.mark);
}
const tidy = m => { if (!M.isBox(m.kind)) return m; const [x0, y0, x1, y1] = M.bounds(m); return { ...m, pts: [[x0, y0], [x1, y1]] }; };
function pointerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const g = drag; drag = null;
  const { d } = g, page = g.mark.page;
  clearPreview(d, page);
  if (g.type === 'draw') {
    const small = g.far < MIN_DRAG, k = g.mark.kind;
    if (small && k !== 'pen') return;   // a click isn't a shape; on the pen it is a dot
    o.change(d, [...d.marks, tidy(g.mark)]);
    syncPage(d, page);
    return warnSigned(d);
  }
  if (g.far < MIN_DRAG) return;
  o.change(d, d.marks.map(m => (m.id === g.from.id ? tidy(g.mark) : m)));
  syncPage(d, page); showSelection(d, selected(d));
}
function cancel() {
  if (!drag) return false;
  const g = drag; drag = null;
  clearPreview(g.d, g.mark.page); syncPage(g.d, g.mark.page); showSelection(g.d, selected(g.d));
  return true;
}
function warnSigned(d) {
  if (d.signWarned) return;
  d.signWarned = true;
  if (M.isSigned(d.bytes)) o.toast('This PDF has a digital signature. Saving your changes will break it.');
}
// A protected PDF can't be written safely (as Reduce file size): say so before anything is drawn. Remembered per copy of
// the file, since a stroke must start at once.
const known = new WeakMap();
function protectedFile(d) {
  if (!known.has(d.bytes)) known.set(d.bytes, M.isProtected(d.bytes));
  return known.get(d.bytes);
}
function canDraw() {
  const d = o.active();
  if (!d) return false;
  if (!protectedFile(d)) return true;
  o.toast("This PDF is protected, so marks can't be added to it.", true);
  return false;
}

/* ---------- selection ---------- */
function select(d, id) { sel = id; showSelection(d, selected(d)); renderOptions(); }
function deselect() {
  if (!sel) return false;
  sel = null; showSelection(o.active(), null); renderOptions();
  return true;
}
function removeSelected() {
  const d = o.active(), m = selected(d);
  if (!m) return false;
  if (o.busy()) { o.toast('Please wait for the current task to finish'); return true; }
  sel = null;
  o.change(d, d.marks.filter(x => x.id !== m.id));
  syncPage(d, m.page); showSelection(d, null); renderOptions();
  return true;
}

/* ---------- the options in the Tools panel ---------- */
function setOption(key, value) {
  const d = o.active(), m = selected(d);
  if (m && o.busy()) { o.toast('Please wait for the current task to finish'); renderOptions(); return; }
  const group = GROUP[m ? m.kind : o.tool()];
  if (group) { styles[group] = { ...styles[group], [key]: value }; remember(); }
  if (m) {
    o.change(d, d.marks.map(x => (x.id === m.id ? { ...x, [key]: value } : x)));
    syncPage(d, m.page); showSelection(d, selected(d));
  }
  renderOptions();
}
function swatchRow(role, label, list, value, canBeNone) {
  const swatches = list.map(c => `<button class="swatch${c === value ? ' on' : ''}" style="--c:${c}" data-c="${c}" title="${c}"></button>`).join('');
  const none = canBeNone ? `<button class="swatch none${value ? '' : ' on'}" data-none title="None"></button>` : '';
  const custom = `<input class="swatch custom" type="color" value="${value || '#000000'}" title="Another colour" aria-label="Another colour">`;
  return `<div class="field" data-role="${role}"><label>${label}</label><div class="swatches">${none}${swatches}${custom}</div></div>`;
}
function renderOptions() {
  const box = document.getElementById('drawOpts'); if (!box || !o) return;
  const d = o.active(), m = selected(d), kind = m ? m.kind : o.tool();
  const hint = document.getElementById('drawHint');
  if (!isDrawTool(kind)) {
    box.innerHTML = '';
    if (hint) hint.hidden = false;
    return;
  }
  if (hint) hint.hidden = true;
  const v = m || styles[GROUP[kind]], marker = kind === 'highlight', widths = marker ? MARKER_WIDTHS : WIDTHS;
  const list = widths.includes(v.width) ? widths : [...widths, v.width].sort((a, b) => a - b);
  const shape = M.isBox(kind);
  box.innerHTML = `<p class="hint">${NAMES[kind]}${m ? ': change it here, drag it to move, or press Delete.' : shape ? ': drag on the page. Shift makes it square or round.' : ': drag on the page. Shift keeps it straight.'}</p>`
    + swatchRow('color', shape ? 'Border' : 'Colour', marker ? MARKER_COLORS : COLORS, v.color, shape)
    + (shape ? swatchRow('fill', 'Fill', COLORS, v.fill, true) : '')
    + `<div class="field" data-role="width"><label>Thickness</label><select aria-label="Thickness">${list.map(w => `<option value="${w}"${w === v.width ? ' selected' : ''}>${w} pt</option>`).join('')}</select></div>`;
}
function wirePanel() {
  for (const [id, kind] of Object.entries(TOOLS)) document.getElementById(id).onclick = () => o.setTool(o.tool() === kind ? 'select' : kind);
  const box = document.getElementById('drawOpts');
  box.addEventListener('click', e => {
    const b = e.target.closest('.swatch:not(.custom)'); if (!b) return;
    const role = b.closest('[data-role]').dataset.role;
    setOption(role, 'none' in b.dataset ? null : b.dataset.c);
  });
  box.addEventListener('change', e => {
    const role = e.target.closest('[data-role]')?.dataset.role;
    if (e.target.matches('select')) setOption('width', +e.target.value);
    else if (e.target.matches('input[type=color]') && role) setOption(role, e.target.value.toLowerCase());
  });
}
function toolChanged(t) {
  for (const [id, kind] of Object.entries(TOOLS)) document.getElementById(id).classList.toggle('on', kind === t);
  o.viewer.classList.toggle('drawing', isDrawTool(t));
  if (t !== 'select' && sel) { sel = null; showSelection(o.active(), null); }
  renderOptions();
}

function init(options) {
  o = options;
  wirePanel();
  o.viewer.addEventListener('pointermove', pointerMove);
  o.viewer.addEventListener('pointerup', pointerUp);
  o.viewer.addEventListener('pointercancel', () => cancel());
  return { sync, pointerDown, removeSelected, cancel, deselect, toolChanged, canDraw, isDrawTool, dragging: () => !!drag };
}
window.SastraDraw = { init, NAMES };
})();

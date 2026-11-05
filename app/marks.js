// Sastra PDF — highlight, pen and shape marks as real PDF annotations (design:
// docs/superpowers/specs/2026-11-05-view-and-marks-design.md). A mark, in the page's own PDF coordinates:
//   { id, page (0-based), kind: highlight | pen | rect | ellipse | line | arrow, pts: [[x, y], …], color, fill ('#rrggbb' or null), width }
// rect and ellipse hold two corners; line and arrow their two ends; highlight and pen every point drawn.
// While a file is open its working copy holds no marks of ours (take), so they can be drawn, moved and undone without
// rewriting the file; they go back in (put) whenever bytes leave the app. No DOM here, so it is plain-Node testable.
(() => {
'use strict';
const root = typeof window !== 'undefined' ? window : globalThis;

// In each appearance stream's dictionary: stream dictionaries are never compressed, so `has` can search plain bytes.
const MARKER = '/SastraMark';
const TAG = 'SastraKind';
const SUBTYPE = { highlight: 'Ink', pen: 'Ink', rect: 'Square', ellipse: 'Circle', line: 'Line', arrow: 'Line' };
const TEXT_KEYS = ['Contents', 'T', 'Subj', 'CreationDate', 'M'];   // what another app may have added: kept as they are

const isBox = k => k === 'rect' || k === 'ellipse';
const isEnds = k => k === 'line' || k === 'arrow';
const round = n => Math.round(n * 1000) / 1000;
const safeHex = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
const toRgb = c => [1, 3, 5].map(i => round(parseInt(c.slice(i, i + 2), 16) / 255));
const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');

/* ---------- geometry ---------- */
function bounds(m) {
  const xs = m.pts.map(p => p[0]), ys = m.pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const moved = (m, dx, dy) => ({ ...m, pts: m.pts.map(([x, y]) => [x + dx, y + dy]) });
// Shift while drawing, from the start point a to the mouse b → where the mark's end goes.
function constrain(kind, a, b, shift) {
  if (!shift) return b;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (isBox(kind)) { const s = Math.max(Math.abs(dx), Math.abs(dy)); return [a[0] + (dx < 0 ? -s : s), a[1] + (dy < 0 ? -s : s)]; }
  const step = Math.PI / 4, ang = Math.round(Math.atan2(dy, dx) / step) * step, len = Math.hypot(dx, dy);
  const snap = v => (Math.abs(v) < 1e-9 ? 0 : v);
  // along the snapped direction, as far as the mouse reaches along it
  const along = dx * Math.cos(ang) + dy * Math.sin(ang);
  const r = Math.abs(along) > 0 ? along : len;
  return [a[0] + snap(r * Math.cos(ang)), a[1] + snap(r * Math.sin(ang))];
}
function handles(m) {
  if (isEnds(m.kind)) return m.pts.map(p => [...p]);
  const [x0, y0, x1, y1] = bounds(m);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}
// Handle i dragged to pt. A line's end just moves; anything else scales inside its box, with the opposite corner staying put.
function resized(m, i, pt) {
  if (isEnds(m.kind)) return { ...m, pts: m.pts.map((p, k) => (k === i ? [pt[0], pt[1]] : p)) };
  const box = handles(m), far = box[(i + 2) % 4], near = box[i];
  const sx = near[0] === far[0] ? 1 : (pt[0] - far[0]) / (near[0] - far[0]);
  const sy = near[1] === far[1] ? 1 : (pt[1] - far[1]) / (near[1] - far[1]);
  return { ...m, pts: m.pts.map(([x, y]) => [far[0] + (x - far[0]) * sx, far[1] + (y - far[1]) * sy]) };
}
function arrowParts(m) {
  const [a, b] = m.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const size = Math.min(Math.max(10, m.width * 4), len), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  const base = [b[0] - ux * size, b[1] - uy * size], half = size / 2;
  return { base, tip: b, left: [base[0] - uy * half, base[1] + ux * half], right: [base[0] + uy * half, base[1] - ux * half], size };
}
function outer(m) {   // the area the mark's ink covers
  const [x0, y0, x1, y1] = bounds(m);
  const p = (m.kind === 'arrow' ? Math.max(arrowParts(m).size, m.width) : m.kind === 'highlight' ? m.width : (m.width || 0) / 2) + 1;
  return [x0 - p, y0 - p, x1 + p, y1 + p].map(round);
}

/* ---------- drawing commands: SVG and canvas, both in PDF coordinates ---------- */
const CAP = m => (m.kind === 'highlight' ? 'square' : 'round');
function svg(m) {
  const color = safeHex(m.color), fill = safeHex(m.fill), w = +m.width || 0;
  const stroke = color && w > 0 ? `stroke="${color}" stroke-width="${w}"` : 'stroke="none"';
  const line = `fill="none" ${stroke} stroke-linecap="${CAP(m)}" stroke-linejoin="round"`;
  if (m.kind === 'rect' || m.kind === 'ellipse') {
    const [x0, y0, x1, y1] = bounds(m), paint = `fill="${fill || 'none'}" ${stroke}`;
    return m.kind === 'rect' ? `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" ${paint}/>`
      : `<ellipse cx="${(x0 + x1) / 2}" cy="${(y0 + y1) / 2}" rx="${(x1 - x0) / 2}" ry="${(y1 - y0) / 2}" ${paint}/>`;
  }
  if (m.kind === 'arrow') {
    const { base, tip, left, right } = arrowParts(m);
    return `<path d="M${m.pts[0]}L${base}" ${line}/><path d="M${tip}L${left}L${right}Z" fill="${color || 'none'}" stroke="none"/>`;
  }
  const d = 'M' + m.pts.join('L') + (m.pts.length === 1 ? `L${m.pts[0]}` : '');
  return `<path d="${d}" ${line}${m.kind === 'highlight' ? ' style="mix-blend-mode:multiply"' : ''}/>`;
}
function paint(ctx, marks, viewport) {
  for (const m of marks) {
    const color = safeHex(m.color), fill = safeHex(m.fill), w = +m.width || 0;
    ctx.save();
    ctx.transform(...viewport.transform);
    ctx.lineWidth = w; ctx.lineCap = CAP(m); ctx.lineJoin = 'round';
    if (color) { ctx.strokeStyle = color; ctx.fillStyle = color; }
    if (m.kind === 'highlight') ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    if (isBox(m.kind)) {
      const [x0, y0, x1, y1] = bounds(m);
      if (m.kind === 'rect') ctx.rect(x0, y0, x1 - x0, y1 - y0);
      else ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (color && w > 0) ctx.stroke();
    } else if (m.kind === 'arrow') {
      const { base, tip, left, right } = arrowParts(m);
      ctx.moveTo(...m.pts[0]); ctx.lineTo(...base); if (w > 0) ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...tip); ctx.lineTo(...left); ctx.lineTo(...right); ctx.closePath(); ctx.fill();
    } else {
      ctx.moveTo(...m.pts[0]);
      for (const p of m.pts.length === 1 ? m.pts : m.pts.slice(1)) ctx.lineTo(...p);
      if (w > 0) ctx.stroke();
    }
    ctx.restore();
  }
}

/* ---------- the appearance in the PDF ---------- */
const N = n => String(round(n));
function appearance(m) {
  const out = [], color = safeHex(m.color), fill = safeHex(m.fill), w = +m.width || 0;
  if (m.kind === 'highlight') out.push('/GS gs');
  if (color) { const [r, g, b] = toRgb(color); out.push(`${N(r)} ${N(g)} ${N(b)} RG`, `${N(r)} ${N(g)} ${N(b)} rg`); }
  out.push(`${N(w)} w`, `${m.kind === 'highlight' ? 2 : 1} J`, '1 j');
  if (isBox(m.kind)) {
    const [x0, y0, x1, y1] = bounds(m);
    if (fill) { const [r, g, b] = toRgb(fill); out.push(`${N(r)} ${N(g)} ${N(b)} rg`); }
    if (m.kind === 'rect') out.push(`${N(x0)} ${N(y0)} ${N(x1 - x0)} ${N(y1 - y0)} re`);
    else {
      const k = 0.5522847498, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, ox = rx * k, oy = ry * k;
      out.push(`${N(cx + rx)} ${N(cy)} m`,
        `${N(cx + rx)} ${N(cy + oy)} ${N(cx + ox)} ${N(cy + ry)} ${N(cx)} ${N(cy + ry)} c`,
        `${N(cx - ox)} ${N(cy + ry)} ${N(cx - rx)} ${N(cy + oy)} ${N(cx - rx)} ${N(cy)} c`,
        `${N(cx - rx)} ${N(cy - oy)} ${N(cx - ox)} ${N(cy - ry)} ${N(cx)} ${N(cy - ry)} c`,
        `${N(cx + ox)} ${N(cy - ry)} ${N(cx + rx)} ${N(cy - oy)} ${N(cx + rx)} ${N(cy)} c`, 'h');
    }
    const stroked = color && w > 0;
    out.push(fill && stroked ? 'B' : fill ? 'f' : stroked ? 'S' : 'n');
  } else if (m.kind === 'arrow') {
    const { base, tip, left, right } = arrowParts(m);
    out.push(`${N(m.pts[0][0])} ${N(m.pts[0][1])} m`, `${N(base[0])} ${N(base[1])} l`, 'S',
      `${N(tip[0])} ${N(tip[1])} m`, `${N(left[0])} ${N(left[1])} l`, `${N(right[0])} ${N(right[1])} l`, 'h', 'f');
  } else {
    const pts = m.pts.length === 1 ? [m.pts[0], m.pts[0]] : m.pts;
    pts.forEach((p, i) => out.push(`${N(p[0])} ${N(p[1])} ${i ? 'l' : 'm'}`));
    out.push('S');
  }
  return out.join('\n');
}

function annotation(context, m) {
  const { PDFName, PDFHexString } = PDFLib;
  const rect = outer(m), color = safeHex(m.color), fill = safeHex(m.fill), w = round(+m.width || 0);
  const resources = m.kind === 'highlight' ? { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply' } } } : {};
  const ap = context.register(context.flateStream(appearance(m), {
    Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: resources, SastraMark: 1
  }));
  const a = {
    Type: 'Annot', Subtype: SUBTYPE[m.kind], Rect: rect, F: 4, [TAG]: m.kind, BS: { W: w, S: 'S' }, AP: { N: ap },
    NM: PDFHexString.fromText(m.id)
  };
  if (color) a.C = toRgb(color);
  if (m.kind === 'highlight' || m.kind === 'pen') a.InkList = [m.pts.flat().map(round)];
  if (m.kind === 'highlight') { a.BM = 'Multiply'; a.CA = 1; }
  if (isBox(m.kind)) {
    if (fill) a.IC = toRgb(fill);
    // Rect is the stroke's outside plus one point; RD says so, as Acrobat writes it
    a.RD = [1, 1, 1, 1];
  }
  if (isEnds(m.kind)) {
    a.L = m.pts.flat().map(round);
    if (m.kind === 'arrow') { a.LE = ['None', 'ClosedArrow']; if (color) a.IC = toRgb(color); }
  }
  const dict = context.obj(a);
  for (const [k, v] of Object.entries(m.extra || {})) dict.set(PDFName.of(k), PDFHexString.fromText(v));
  return dict;
}

/* ---------- into and out of the file ---------- */
async function put(bytes, marks) {
  if (!marks.length) return bytes;
  const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  for (const m of marks) {
    const page = pages[m.page];
    if (page) page.node.addAnnot(doc.context.register(annotation(doc.context, m)));
  }
  return doc.save();
}

function numbers(arr) {
  const { PDFArray, PDFNumber } = PDFLib;
  if (!(arr instanceof PDFArray)) return null;
  const out = [];
  for (let i = 0; i < arr.size(); i++) { const n = arr.lookup(i); if (!(n instanceof PDFNumber)) return null; out.push(n.asNumber()); }
  return out;
}
function colourOf(dict, key) {
  const c = numbers(dict.lookup(PDFLib.PDFName.of(key)));
  if (!c) return null;
  if (c.length === 3) return toHex(c);
  if (c.length === 1) return toHex([c[0], c[0], c[0]]);
  if (c.length === 4) return toHex([0, 1, 2].map(i => (1 - c[i]) * (1 - c[3])));
  return null;
}
const pairs = list => { const out = []; for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i], list[i + 1]]); return out; };
// A dictionary tagged as ours → the mark, from the standard keys (another app may have changed them), or null when it
// doesn't read as one: then it simply stays in the file.
function readMark(dict, page) {
  const { PDFName, PDFArray, PDFString, PDFHexString } = PDFLib;
  const get = k => dict.lookup(PDFName.of(k));
  const tag = get(TAG), kind = tag && tag.asString ? tag.asString().replace(/^\//, '') : null;
  if (!SUBTYPE[kind]) return null;
  const bs = get('BS'), wv = bs && bs.lookup ? bs.lookup(PDFName.of('W')) : null;
  const width = wv && wv.asNumber ? wv.asNumber() : 1;
  let pts = null;
  if (kind === 'highlight' || kind === 'pen') {
    const list = get('InkList');
    if (!(list instanceof PDFArray) || list.size() !== 1) return null;
    const n = numbers(list.lookup(0)); if (!n || n.length < 2) return null;
    pts = pairs(n);
  } else if (isEnds(kind)) {
    const n = numbers(get('L')); if (!n || n.length !== 4) return null;
    pts = pairs(n);
  } else {
    const r = numbers(get('Rect')), rd = numbers(get('RD')) || [0, 0, 0, 0];
    if (!r || r.length !== 4 || rd.length !== 4) return null;
    const x0 = Math.min(r[0], r[2]), y0 = Math.min(r[1], r[3]), x1 = Math.max(r[0], r[2]), y1 = Math.max(r[1], r[3]), h = width / 2;
    pts = [[x0 + rd[0] + h, y0 + rd[1] + h], [x1 - rd[2] - h, y1 - rd[3] - h]];
  }
  const extra = {};
  for (const k of TEXT_KEYS) {
    const v = get(k);
    if (v instanceof PDFString || v instanceof PDFHexString) extra[k] = v.decodeText();
  }
  const nm = get('NM'), id = nm instanceof PDFString || nm instanceof PDFHexString ? nm.decodeText() : '';
  const mark = { id: /^[\w-]{1,64}$/.test(id) ? id : newId(), page, kind, pts, color: colourOf(dict, 'C'), fill: isBox(kind) ? colourOf(dict, 'IC') : null, width };
  if (Object.keys(extra).length) mark.extra = extra;
  return mark;
}
let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

// → { bytes: the same file with no marks of ours, marks }
async function take(bytes) {
  const { PDFName, PDFRef, PDFDict, PDFRawStream } = PDFLib;
  const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const marks = [], ctx = doc.context;
  doc.getPages().forEach((page, p) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const dict = annots.lookup(i);
      if (!(dict instanceof PDFDict)) continue;
      const mark = readMark(dict, p);
      if (!mark) continue;
      marks.unshift(mark);
      const ap = dict.lookup(PDFName.of('AP')), n = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : null;
      if (n instanceof PDFRef) ctx.delete(n);
      const ref = annots.get(i);
      if (ref instanceof PDFRef) ctx.delete(ref);
      annots.remove(i);
    }
    if (annots.size() === 0) page.node.delete(PDFName.of('Annots'));
  });
  // Appearances left behind by a deleted page: nothing draws them, and they would make `has` say yes for ever.
  const used = new Set();
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    for (let i = 0; i < (annots ? annots.size() : 0); i++) {
      const dict = annots.lookup(i), ap = dict instanceof PDFDict ? dict.lookup(PDFName.of('AP')) : null, n = ap instanceof PDFDict ? ap.get(PDFName.of('N')) : null;
      if (n instanceof PDFRef) used.add(n.toString());
    }
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.has(PDFName.of(MARKER.slice(1))) && !used.has(ref.toString())) ctx.delete(ref);
  }
  return { bytes: await doc.save(), marks };
}

// Does this file hold marks of ours? A plain search, so a file with none pays nothing.
const search = (bytes, word) => {
  const first = word.charCodeAt(0);
  for (let i = bytes.indexOf(first); i !== -1 && i <= bytes.length - word.length; i = bytes.indexOf(first, i + 1)) {
    let k = 1; while (k < word.length && bytes[i + k] === word.charCodeAt(k)) k++;
    if (k === word.length) return true;
  }
  return false;
};
const has = bytes => search(bytes, MARKER);
// A protected file can't be written safely, and writing a signed one breaks its signature. Both words are plain text in a file's structure.
const isProtected = bytes => search(bytes, '/Encrypt');
const isSigned = bytes => search(bytes, '/ByteRange');

root.SastraMarks = { has, take, put, paint, svg, constrain, bounds, moved, handles, resized, newId, isProtected, isSigned, isBox, isEnds };
})();

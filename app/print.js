// Sastra PDF — printing, modelled on Acrobat's Print window: which pages, how they sit on the paper
// (Size / Poster / Multiple / Booklet), drawing each sheet, the dialog and the print run.
// Loaded by index.html before its main script. The app hands over what the dialog needs through
// SastraPrint.open({ … }); main.js sends the finished sheets to the printer (see 'print' there).
(() => {
'use strict';

/* ---------- paper and layout constants (points: 72 per inch) ---------- */
const MM = 72 / 25.4;
const PAPERS = { A4:[210,297], A3:[297,420], A5:[148,210], Letter:[215.9,279.4], Legal:[215.9,355.6] };   // mm, portrait
const M = 5 * MM;            // margin round the printable area (most printers can't print the last ~4 mm)
const GAP = 3 * MM;          // between pages in Multiple
const MARK_M = 10 * MM;      // Poster margin when labels or cut marks need room
const GRIDS = { 2:[1,2], 4:[2,2], 6:[2,3], 9:[3,3], 16:[4,4] };   // [columns, rows] on a portrait sheet
const clamp = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

function paperPt(name, land){
  const [w, h] = PAPERS[name] || PAPERS.A4;
  return land ? { w:h*MM, h:w*MM } : { w:w*MM, h:h*MM };
}

/* ---------- which pages: scope → odd/even → reverse ---------- */
function pickPages(n, o, parseRanges){
  let pages;
  if (o.scope === 'current') pages = [o.current];
  else if (o.scope === 'selected') pages = [...o.sel].sort((a, b) => a - b);
  else if (o.scope === 'range') {
    try { pages = parseRanges(o.range, n).flat(); }
    catch (e) { return { pages:[], error:e.message }; }
  }
  else pages = [...Array(n).keys()];
  if (o.subset === 'odd') pages = pages.filter(i => i % 2 === 0);       // page numbers 1, 3, 5…
  else if (o.subset === 'even') pages = pages.filter(i => i % 2 === 1);
  if (o.reverse) pages.reverse();
  return { pages, error: pages.length ? null : 'There are no pages to print with these choices.' };
}

/* ---------- sheet planning ----------
   Every sheet: { w, h } paper in points as it is read (landscape = wider), items placed on it
   ({ i page index or null = blank, x, y top-left of the page, s scale, rot 0|90 extra clockwise }),
   an optional clip (Poster), page borders, cut marks, a label, and a tag ("blank,1") for tests. */
const tagOf = items => items.map(it => it.i == null ? 'blank' : it.i + 1).join(',');
const blank = () => ({ i:null, x:0, y:0, s:0, rot:0 });
function mkSheet(p, items, extra){ return { w:p.w, h:p.h, items, clip:null, border:false, marks:[], label:null, tag:tagOf(items), ...extra }; }
function place(i, sz, box){   // page fitted inside box, centred
  const s = Math.min(box.w / sz.w, box.h / sz.h);
  return { i, s, rot:0, x: box.x + (box.w - sz.w * s) / 2, y: box.y + (box.h - sz.h * s) / 2 };
}

function planSize(sizes, pages, o){
  const how = o.size.how, pct = clamp(o.size.pct, 1, 1000, 100);
  return pages.map(i => {
    const sz = sizes[i], land = o.orient === 'auto' ? sz.w > sz.h : o.orient === 'landscape';
    const p = paperPt(o.paper, land), fit = Math.min((p.w - 2*M) / sz.w, (p.h - 2*M) / sz.h);
    const s = how === 'actual' ? 1 : how === 'shrink' ? Math.min(1, fit) : how === 'custom' ? pct / 100 : fit;
    return mkSheet(p, [{ i, s, rot:0, x:(p.w - sz.w * s) / 2, y:(p.h - sz.h * s) / 2 }]);
  });
}

function planMultiple(sizes, pages, o){
  const n = GRIDS[o.multi.n] ? +o.multi.n : 4;
  const layout = land => {
    const p = paperPt(o.paper, land), [c, r] = GRIDS[n], cols = land ? r : c, rows = land ? c : r;
    return { p, cols, rows, cw:(p.w - 2*M - (cols-1)*GAP) / cols, ch:(p.h - 2*M - (rows-1)*GAP) / rows };
  };
  let land = o.orient === 'landscape';
  if (o.orient === 'auto') {   // the orientation whose cells hold the first page larger
    const sz = sizes[pages[0]], fitIn = L => Math.min(L.cw / sz.w, L.ch / sz.h);
    land = fitIn(layout(true)) > fitIn(layout(false)) + 1e-9;
  }
  const L = layout(land), ord = o.multi.order;
  const cell = j => {
    let col, row;
    if (ord === 'v' || ord === 'vr') { col = Math.floor(j / L.rows); row = j % L.rows; }
    else { col = j % L.cols; row = Math.floor(j / L.cols); }
    if (ord === 'hr' || ord === 'vr') col = L.cols - 1 - col;
    return { x: M + col * (L.cw + GAP), y: M + row * (L.ch + GAP), w: L.cw, h: L.ch };
  };
  const out = [];
  for (let k = 0; k < pages.length; k += n)
    out.push(mkSheet(L.p, pages.slice(k, k + n).map((i, j) => place(i, sizes[i], cell(j))), { border: !!o.multi.border }));
  return out;
}

function planBooklet(sizes, pages, o){
  const N = Math.ceil(pages.length / 4) * 4, seq = [...pages, ...Array(N - pages.length).fill(null)];
  const p = paperPt(o.paper, true), half = p.w / 2;
  const boxes = [{ x:M, y:M, w:half - M, h:p.h - 2*M }, { x:half, y:M, w:half - M, h:p.h - 2*M }];
  const side = pair => {
    if (o.booklet.binding === 'right') pair = [pair[1], pair[0]];   // right-to-left reading
    return mkSheet(p, pair.map((i, k) => i == null ? blank() : place(i, sizes[i], boxes[k])));
  };
  const ks = [...Array(N / 4).keys()]; if (o.reverse) ks.reverse();
  const sub = o.booklet.subset;
  return ks.flatMap(k => {
    const front = side([seq[N-1-2*k], seq[2*k]]), back = side([seq[2*k+1], seq[N-2-2*k]]);
    return sub === 'front' ? [front] : sub === 'back' ? [back] : [front, back];
  });
}

function planPoster(sizes, pages, o){
  const t = clamp(o.poster.pct, 10, 1000, 100) / 100, m = o.poster.labels || o.poster.marks ? MARK_M : M;
  const out = [];
  for (const i of pages) {
    const sz = sizes[i], PW = sz.w * t, PH = sz.h * t;
    const tiles = land => {
      const p = paperPt(o.paper, land), aw = p.w - 2*m, ah = p.h - 2*m;
      const ov = Math.min(clamp(o.poster.overlap, 0, 50, 0) * MM, aw / 2, ah / 2);
      const count = (len, a) => Math.max(1, Math.ceil((len - ov) / (a - ov) - 1e-9));
      return { p, aw, ah, ov, cols:count(PW, aw), rows:count(PH, ah) };
    };
    let T;
    if (o.orient === 'auto') { const a = tiles(false), b = tiles(true); T = b.cols * b.rows < a.cols * a.rows ? b : a; }
    else T = tiles(o.orient === 'landscape');
    const sx = T.aw - T.ov, sy = T.ah - T.ov;
    const ox = (T.cols * sx + T.ov - PW) / 2, oy = (T.rows * sy + T.ov - PH) / 2;   // poster centred on the tiles
    const clip = { x:m, y:m, w:T.aw, h:T.ah };
    for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) out.push(mkSheet(T.p,
      [{ i, s:t, rot:0, x: m - (c * sx - ox), y: m - (r * sy - oy) }],
      { clip,
        label: o.poster.labels ? `${o.name} · page ${i+1} · row ${r+1}, column ${c+1}` : null,
        marks: o.poster.marks ? cutMarks(clip) : [] }));
  }
  return out;
}
function cutMarks(b){   // two short hairlines out from each corner of the printable area
  const L = 5 * MM, g = 1 * MM, out = [];
  for (const [x, dx] of [[b.x, -1], [b.x + b.w, 1]]) for (const [y, dy] of [[b.y, -1], [b.y + b.h, 1]]) {
    out.push([x + dx*g, y, x + dx*(g+L), y]); out.push([x, y + dy*g, x, y + dy*(g+L)]);
  }
  return out;
}

function planSheets(sizes, pages, o){
  if (!pages.length) return { sheets:[], duplex:null };
  const plan = { size:planSize, multiple:planMultiple, booklet:planBooklet, poster:planPoster }[o.mode] || planSize;
  return { sheets: plan(sizes, pages, o), duplex: o.mode === 'booklet' && o.booklet.subset === 'both' ? 'shortEdge' : null };
}

window.SastraPrint = { PAPERS, pickPages, planSheets };
})();

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
const PICKED = '<button><selectedcontent></selectedcontent></button>';   // the printer box: a long name ends in "…"
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

/* ---------- drawing one sheet ----------
   pxPerPt = canvas pixels per point. base = a canvas transform under everything (printing turns
   landscape sheets onto portrait paper with it). pdf.js paints a white background over its whole
   canvas, so each page is drawn on its own canvas, only the part that shows, then copied over. */
async function drawSheet(getPage, sizes, sh, px, ctx, opt = {}){
  const base = opt.base || [1, 0, 0, 1, 0, 0], reset = () => ctx.setTransform(...base);
  reset(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sh.w * px, sh.h * px);
  const area = sh.clip || { x:0, y:0, w:sh.w, h:sh.h };
  for (const it of sh.items) {
    if (it.i == null || opt.cancelled?.()) continue;
    const sz = sizes[it.i], bw = (it.rot ? sz.h : sz.w) * it.s, bh = (it.rot ? sz.w : sz.h) * it.s;
    const x0 = Math.max(it.x, area.x, 0), y0 = Math.max(it.y, area.y, 0);
    const x1 = Math.min(it.x + bw, area.x + area.w, sh.w), y1 = Math.min(it.y + bh, area.y + area.h, sh.h);
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) continue;
    const X0 = Math.floor(x0 * px), Y0 = Math.floor(y0 * px), X1 = Math.ceil(x1 * px), Y1 = Math.ceil(y1 * px);
    const page = await getPage(it.i);
    const vp = page.getViewport({ scale: it.s * px, rotation: (page.rotate + it.rot) % 360 });
    const c = document.createElement('canvas'); c.width = X1 - X0; c.height = Y1 - Y0;
    // intent 'print': annotations show as they do on paper (some are screen-only or print-only)
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print', transform: [1, 0, 0, 1, it.x * px - X0, it.y * px - Y0] }).promise;
    reset(); ctx.filter = opt.gray ? 'grayscale(1)' : 'none'; ctx.drawImage(c, X0, Y0); ctx.filter = 'none';
    c.width = c.height = 0;   // free the memory now, not at the next garbage collection
  }
  reset();
  if (sh.border) {
    ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, 0.5 * px);
    for (const it of sh.items) if (it.i != null) {
      const sz = sizes[it.i]; ctx.strokeRect(it.x * px, it.y * px, (it.rot ? sz.h : sz.w) * it.s * px, (it.rot ? sz.w : sz.h) * it.s * px);
    }
  }
  if (sh.marks.length) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 0.3 * px); ctx.beginPath();
    for (const [a, b, c, d] of sh.marks) { ctx.moveTo(a * px, b * px); ctx.lineTo(c * px, d * px); }
    ctx.stroke();
  }
  if (sh.label) {
    ctx.fillStyle = '#555'; ctx.textBaseline = 'middle';
    ctx.font = `${7 * px}px "IBM Plex Sans","Noto Sans Khmer","Khmer UI",sans-serif`;
    ctx.fillText(sh.label, area.x * px, area.y / 2 * px, area.w * px);
  }
}

/* ---------- the Print dialog ---------- */
const DEFAULTS = { printer:'', paper:'A4', mode:'size', orient:'auto', gray:false, duplex:false, flip:'long',
  size:{ how:'fit', pct:100 }, poster:{ pct:100, overlap:0, labels:false, marks:false },
  multi:{ n:2, order:'h', border:false }, booklet:{ subset:'both', binding:'left' } };
const STORE = 'sastra-print';
function loadSettings(){
  let s = {}; try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch {}
  const o = structuredClone(DEFAULTS);
  for (const k of Object.keys(o)) if (s[k] != null && typeof s[k] === typeof o[k]) o[k] = typeof o[k] === 'object' ? { ...o[k], ...s[k] } : s[k];
  if (!PAPERS[o.paper]) o.paper = 'A4';
  return o;
}
const saveSettings = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} };
const fmtMm = pt => Math.round(pt / MM);

const DIALOG = `
<div class="pr-set">
  <h2 id="prTitle">Print</h2>
  <div class="pr-grp" data-desk>
    <div class="row">
      <div class="field"><label for="prPrinter">Printer</label><select id="prPrinter">${PICKED}<option>Finding printers…</option></select></div>
      <button class="btn outline" id="prProps" type="button" title="Windows' printing preferences for this printer: paper tray, quality… What you change there stays as the printer's default.">Properties</button>
    </div>
    <div class="row">
      <div class="field pr-copies"><label for="prCopies">Copies</label><input type="number" id="prCopies" min="1" max="999" value="1"></div>
    </div>
  </div>
  <p class="hint" data-web>Your browser asks which printer to use in the next window.</p>
  <label class="chk"><input type="checkbox" id="prGray">Print in grayscale (black and white)</label>

  <fieldset class="pr-grp"><legend>Pages to print</legend>
    <label class="chk"><input type="radio" name="prScope" value="all">All</label>
    <label class="chk"><input type="radio" name="prScope" value="current">Current page <span class="pr-note" id="prCurN"></span></label>
    <label class="chk"><input type="radio" name="prScope" value="selected">Selected pages <span class="pr-note" id="prSelN"></span></label>
    <label class="chk pr-range"><input type="radio" name="prScope" value="range">Pages <input type="text" id="prRange" aria-label="Pages to print" placeholder="1-3, 7" spellcheck="false"></label>
    <div class="row pr-more">
      <div class="field"><label for="prSubset">More options</label>
        <select id="prSubset"><option value="all">All pages in range</option><option value="odd">Odd pages only</option><option value="even">Even pages only</option></select></div>
      <label class="chk"><input type="checkbox" id="prReverse">Reverse pages</label>
    </div>
    <p class="err-msg" id="prErr" hidden></p>
  </fieldset>

  <fieldset class="pr-grp"><legend>Page sizing &amp; handling</legend>
    <div class="seg" id="prMode"><button type="button" data-v="size">Size</button><button type="button" data-v="poster">Poster</button><button type="button" data-v="multiple">Multiple</button><button type="button" data-v="booklet">Booklet</button></div>
    <div class="pr-panel" data-mode="size">
      <label class="chk"><input type="radio" name="prSize" value="fit">Fit</label>
      <label class="chk"><input type="radio" name="prSize" value="actual">Actual size</label>
      <label class="chk"><input type="radio" name="prSize" value="shrink">Shrink oversized pages</label>
      <label class="chk"><input type="radio" name="prSize" value="custom">Custom scale <input type="number" id="prPct" min="1" max="1000" aria-label="Custom scale in percent"> %</label>
    </div>
    <div class="pr-panel" data-mode="poster">
      <div class="row">
        <div class="field"><label for="prTile">Tile scale (%)</label><input type="number" id="prTile" min="10" max="1000"></div>
        <div class="field"><label for="prOverlap">Overlap (mm)</label><input type="number" id="prOverlap" min="0" max="50"></div>
      </div>
      <label class="chk"><input type="checkbox" id="prLabels">Labels (file name, page, row and column)</label>
      <label class="chk"><input type="checkbox" id="prMarks">Cut marks</label>
    </div>
    <div class="pr-panel" data-mode="multiple">
      <div class="row">
        <div class="field"><label for="prPer">Pages per sheet</label><select id="prPer"><option>2</option><option>4</option><option>6</option><option>9</option><option>16</option></select></div>
        <div class="field"><label for="prOrder">Page order</label><select id="prOrder"><option value="h">Horizontal</option><option value="hr">Horizontal reversed</option><option value="v">Vertical</option><option value="vr">Vertical reversed</option></select></div>
      </div>
      <label class="chk"><input type="checkbox" id="prBorder">Print page border</label>
    </div>
    <div class="pr-panel" data-mode="booklet">
      <div class="row">
        <div class="field"><label for="prSubsetB">Booklet subset</label><select id="prSubsetB"><option value="both">Both sides</option><option value="front">Front side only</option><option value="back">Back side only</option></select></div>
        <div class="field"><label for="prBinding">Binding</label><select id="prBinding"><option value="left">Left</option><option value="right">Right</option></select></div>
      </div>
      <p class="hint">Fold the printed stack in half to make the booklet. If the printer can't print on both sides, print <b>Front side only</b>, put the stack back in the tray, then print <b>Back side only</b>.</p>
    </div>
  </fieldset>

  <fieldset class="pr-grp"><legend>Orientation and paper</legend>
    <div class="pr-inline">
      <label class="chk"><input type="radio" name="prOrient" value="auto">Auto</label>
      <label class="chk"><input type="radio" name="prOrient" value="portrait">Portrait</label>
      <label class="chk"><input type="radio" name="prOrient" value="landscape">Landscape</label>
    </div>
    <div class="field"><label for="prPaper">Paper</label><select id="prPaper">${Object.entries(PAPERS).map(([k, [w, h]]) => `<option value="${k}">${k} (${w} × ${h} mm)</option>`).join('')}</select></div>
  </fieldset>

  <div class="pr-grp" data-desk>
    <label class="chk"><input type="checkbox" id="prDuplex">Print on both sides of paper</label>
    <div class="pr-inline pr-flip">
      <label class="chk"><input type="radio" name="prFlip" value="long">Flip on long edge</label>
      <label class="chk"><input type="radio" name="prFlip" value="short">Flip on short edge</label>
    </div>
  </div>
</div>
<div class="pr-view">
  <div class="pr-info" id="prInfo"></div>
  <div class="pr-stage" id="prStage"><canvas id="prCanvas"></canvas><p class="pr-none" hidden>Nothing to print</p></div>
  <div class="pr-nav"><button class="btn icon" id="prPrev" type="button" title="Previous sheet"></button><span id="prSheet"></span><button class="btn icon" id="prNext" type="button" title="Next sheet"></button></div>
</div>
<div class="pr-foot"><span class="pr-status" id="prStatus" role="status"></span><button class="btn outline" id="prCancel" type="button">Cancel</button><button class="btn primary" id="prGo" type="button">Print</button></div>`;

let openNow = false;
function open({ doc, desk, toast, svg, parseRanges }){
  if (openNow) return; openNow = true;
  const S = loadSettings(), back = document.activeElement;
  const getPage = i => doc.pdf.getPage(i + 1);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal print" role="dialog" aria-modal="true" aria-labelledby="prTitle">${DIALOG}</div>`;
  const dlg = bg.firstElementChild, q = s => dlg.querySelector(s), qa = s => [...dlg.querySelectorAll(s)];
  const radioVal = n => q(`input[name="${n}"]:checked`)?.value;
  const setRadio = (n, v) => { const r = q(`input[name="${n}"][value="${v}"]`); if (r) r.checked = true; };
  q('#prPrev').innerHTML = svg('left'); q('#prNext').innerHTML = svg('right');
  qa(desk ? '[data-web]' : '[data-desk]').forEach(el => el.hidden = true);

  // page choice belongs to this document and this time only; the rest is remembered
  const sel = [...doc.sel];
  q('#prCurN').textContent = `(${doc.current + 1})`;
  q('#prSelN').textContent = sel.length ? `(${sel.length})` : '';
  q('input[name="prScope"][value="selected"]').disabled = !sel.length;
  setRadio('prScope', sel.length >= 2 ? 'selected' : 'all');
  q('#prRange').value = doc.n > 1 ? `1-${doc.n}` : '1';

  // settings → controls
  function syncUI(){
    q('#prGray').checked = S.gray;
    qa('#prMode button').forEach(b => b.classList.toggle('on', b.dataset.v === S.mode));
    qa('.pr-panel').forEach(p => p.hidden = p.dataset.mode !== S.mode);
    setRadio('prSize', S.size.how); q('#prPct').value = S.size.pct;
    q('#prTile').value = S.poster.pct; q('#prOverlap').value = S.poster.overlap;
    q('#prLabels').checked = S.poster.labels; q('#prMarks').checked = S.poster.marks;
    q('#prPer').value = String(S.multi.n); q('#prOrder').value = S.multi.order; q('#prBorder').checked = S.multi.border;
    q('#prSubsetB').value = S.booklet.subset; q('#prBinding').value = S.booklet.binding;
    setRadio('prOrient', S.orient); q('#prPaper').value = S.paper;
    const bk = S.mode === 'booklet';   // a booklet decides both-sides printing itself
    q('#prDuplex').checked = bk ? S.booklet.subset === 'both' : S.duplex; q('#prDuplex').disabled = bk;
    setRadio('prFlip', bk ? 'short' : S.flip);
    qa('input[name="prFlip"]').forEach(r => r.disabled = bk || !S.duplex);
    q('#prSubset').disabled = bk;   // odd/even makes no sense in a booklet; Reverse reverses its sheets
  }
  // controls → settings
  function readUI(){
    S.gray = q('#prGray').checked;
    S.size = { how: radioVal('prSize') || 'fit', pct: clamp(q('#prPct').value, 1, 1000, 100) };
    S.poster = { pct: clamp(q('#prTile').value, 10, 1000, 100), overlap: clamp(q('#prOverlap').value, 0, 50, 0), labels: q('#prLabels').checked, marks: q('#prMarks').checked };
    S.multi = { n: +q('#prPer').value, order: q('#prOrder').value, border: q('#prBorder').checked };
    S.booklet = { subset: q('#prSubsetB').value, binding: q('#prBinding').value };
    S.orient = radioVal('prOrient') || 'auto'; S.paper = q('#prPaper').value;
    if (S.mode !== 'booklet') { S.duplex = q('#prDuplex').checked; S.flip = radioVal('prFlip') || 'long'; }
    if (desk && q('#prPrinter').value && printers.length) S.printer = q('#prPrinter').value;
  }

  // the plan and the preview
  let plan = { sheets:[], duplex:null }, view = 0, drawGen = 0, drawT = 0;
  function recompute(){
    const r = pickPages(doc.n, { scope: radioVal('prScope'), current: doc.current, sel, range: q('#prRange').value,
      subset: S.mode === 'booklet' ? 'all' : q('#prSubset').value, reverse: S.mode !== 'booklet' && q('#prReverse').checked }, parseRanges);
    plan = planSheets(doc.sizes, r.pages, { ...S, reverse: S.mode === 'booklet' && q('#prReverse').checked, name: doc.name });
    view = Math.max(0, Math.min(view, plan.sheets.length - 1));
    const err = q('#prErr'); err.textContent = r.error || ''; err.hidden = !r.error;
    updateView();
  }
  function updateView(){
    const n = plan.sheets.length, sh = plan.sheets[view];
    q('#prSheet').textContent = n ? `${S.mode === 'booklet' && S.booklet.subset === 'both' ? 'Side' : 'Sheet'} ${view + 1} of ${n}` : 'Nothing to print';
    q('#prPrev').disabled = view <= 0; q('#prNext').disabled = view >= n - 1;
    q('#prGo').disabled = !n || running || (desk && !printers.length);
    q('#prCanvas').hidden = !n; q('.pr-none').hidden = !!n;
    let info = '';
    if (sh) {
      info = `${S.paper} · ${sh.w > sh.h ? 'landscape' : 'portrait'}`;
      const it = sh.items[0];
      if (S.mode === 'size') info = `Page ${it.i + 1} · ${fmtMm(doc.sizes[it.i].w)} × ${fmtMm(doc.sizes[it.i].h)} mm → ${info} · scale ${Math.round(it.s * 100)} %`;
      if (S.mode === 'booklet') info += ` · ${view % 2 && S.booklet.subset === 'both' ? 'back' : S.booklet.subset === 'back' ? 'back' : 'front'}`;
      if (S.mode === 'poster') info += ` · ${plan.sheets.filter(s => s.items[0].i === it.i).length} sheets for page ${it.i + 1}`;
    }
    q('#prInfo').textContent = info;
    redraw();
  }
  // the preview follows 120 ms after the last change; .drawing marks it as not yet up to date
  function redraw(){ dlg.classList.add('drawing'); clearTimeout(drawT); drawT = setTimeout(drawPreview, 120); }
  async function drawPreview(){
    const sh = plan.sheets[view], gen = ++drawGen;
    if (!sh || !bg.isConnected) { dlg.classList.remove('drawing'); return; }   // nothing to show, or closed meanwhile
    const stage = q('#prStage'), cs = getComputedStyle(stage);
    const sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const shH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const fit = Math.max(0.05, Math.min(sw / sh.w, shH / sh.h)), dpr = Math.min(devicePixelRatio || 1, 2);
    const c = document.createElement('canvas'); c.id = 'prCanvas';
    c.width = Math.round(sh.w * fit * dpr); c.height = Math.round(sh.h * fit * dpr);
    c.style.width = Math.round(sh.w * fit) + 'px'; c.style.height = Math.round(sh.h * fit) + 'px';
    try { await drawSheet(getPage, doc.sizes, sh, fit * dpr, c.getContext('2d'), { gray: S.gray, cancelled: () => gen !== drawGen }); }
    catch (e) { console.error(e); }
    if (gen !== drawGen || !bg.isConnected) return;
    q('#prCanvas').replaceWith(c); dlg.classList.remove('drawing');
  }
  const changed = () => { readUI(); syncUI(); saveSettings(S); recompute(); };

  // printers
  let printers = [];
  if (desk) desk.printers().then(list => {
    if (!bg.isConnected) return;   // closed before the list came
    printers = list || []; const s = q('#prPrinter');
    if (!printers.length) { s.innerHTML = PICKED + '<option value="">No printers installed</option>'; s.disabled = true; q('#prProps').disabled = true; }
    else {
      s.innerHTML = PICKED + printers.map(p => `<option></option>`).join('');
      printers.forEach((p, k) => { s.options[k].value = p.name; s.options[k].textContent = p.displayName; });
      s.value = (printers.find(p => p.name === S.printer) || printers.find(p => p.isDefault) || printers[0]).name;
    }
    updateView();
  }, () => toast('Could not list the printers', true));
  q('#prProps').onclick = async () => { if (!(await desk.printerPrefs(q('#prPrinter').value))) toast('Could not open the settings of this printer', true); };

  // wiring
  dlg.addEventListener('change', e => {
    if (e.target.matches('#prPrinter')) { readUI(); saveSettings(S); } else changed();
  });
  dlg.addEventListener('input', e => { if (e.target.matches('#prRange')) { setRadio('prScope', 'range'); recompute(); } else if (e.target.matches('input[type=number]')) changed(); });
  q('#prRange').addEventListener('focus', () => { setRadio('prScope', 'range'); recompute(); });
  q('#prMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || running) return; S.mode = b.dataset.v; view = 0; syncUI(); saveSettings(S); recompute(); });
  q('#prPrev').onclick = () => { view--; updateView(); };
  q('#prNext').onclick = () => { view++; updateView(); };
  q('#prStage').addEventListener('wheel', e => { e.preventDefault(); const v = Math.max(0, Math.min(plan.sheets.length - 1, view + Math.sign(e.deltaY))); if (v !== view) { view = v; updateView(); } }, { passive:false });
  q('#prCancel').onclick = () => running ? (cancelled = true) : close();
  q('#prGo').onclick = () => go();
  bg.addEventListener('click', e => { if (e.target === bg && !running) close(); });
  const keys = e => {
    if (e.target.closest?.('select')?.matches(':open')) return;   // an open dropdown list handles its own Esc / Enter
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (running) cancelled = true; else close(); }
    else if (e.key === 'Enter' && !e.target.closest('button, select') && !q('#prGo').disabled) { e.preventDefault(); go(); }
  };
  document.addEventListener('keydown', keys, true);
  const ro = new ResizeObserver(redraw); ro.observe(q('#prStage'));
  function close(){
    if (!bg.isConnected) return;
    drawGen++; clearTimeout(drawT); ro.disconnect(); document.removeEventListener('keydown', keys, true);
    bg.remove(); openNow = false; back?.focus?.({ preventScroll:true });
  }

  /* ---------- printing: draw every sheet at print resolution, then send ---------- */
  let running = false, cancelled = false;
  async function go(){
    if (running || !plan.sheets.length) return;
    readUI(); saveSettings(S);
    const sheets = plan.sheets, n = sheets.length, [pw, ph] = PAPERS[S.paper];
    const dpi = n > 150 ? 150 : 300, outW = Math.round(pw / 25.4 * dpi), outH = Math.round(ph / 25.4 * dpi);
    const printer = desk ? q('#prPrinter').selectedOptions[0]?.textContent || S.printer : '';
    running = true; cancelled = false; dlg.classList.add('running');
    qa('.pr-set :is(input, select, button), #prMode button, #prGo').forEach(el => { if (!el.disabled) { el.disabled = true; el.dataset.run = ''; } });
    const status = t => { q('#prStatus').textContent = t; };
    const area = printArea(); area.textContent = '';
    let pageCss = document.getElementById('printPage');
    if (!pageCss) { pageCss = document.createElement('style'); pageCss.id = 'printPage'; document.head.appendChild(pageCss); }
    pageCss.textContent = `@page{size:${pw}mm ${ph}mm;margin:0}#printArea img{width:${pw}mm;height:${ph}mm}`;
    const urls = [];
    let result = null;
    try {
      for (let k = 0; k < n && !cancelled; k++) {
        status(`Preparing sheet ${k + 1} of ${n}…`);
        const sh = sheets[k], land = sh.w > sh.h, px = (land ? outH : outW) / sh.w;
        const c = document.createElement('canvas'); c.width = outW; c.height = outH;
        // landscape sheets go on the portrait paper turned, top to the left edge, as a printer driver does
        await drawSheet(getPage, doc.sizes, sh, px, c.getContext('2d'), { gray: S.gray, base: land ? [0, -1, 1, 0, 0, outH] : null, cancelled: () => cancelled });
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); c.width = c.height = 0;
        const img = new Image(); img.className = 'psheet'; img.dataset.pages = sh.tag; img.alt = '';
        img.src = URL.createObjectURL(blob); urls.push(img.src); area.appendChild(img);
      }
      if (!cancelled) {
        await Promise.all([...area.children].map(i => i.decode()));
        status(desk ? `Sending ${n} sheet${n > 1 ? 's' : ''} to ${printer}…` : 'Opening the print window…');
        if (desk) result = await desk.print({ deviceName: q('#prPrinter').value, copies: clamp(q('#prCopies').value, 1, 999, 1), color: !S.gray,
          duplexMode: plan.duplex || (S.mode !== 'booklet' && S.duplex ? (S.flip === 'short' ? 'shortEdge' : 'longEdge') : 'simplex'), pageSize: S.paper });
        else { window.print(); result = { ok:true }; }
      }
    } catch (e) { console.error(e); result = { ok:false, reason: e?.message || String(e) }; }
    area.textContent = ''; urls.forEach(u => URL.revokeObjectURL(u));
    running = false; dlg.classList.remove('running');
    qa('[data-run]').forEach(el => { el.disabled = false; delete el.dataset.run; });
    if (cancelled) { status('Cancelled'); syncUI(); updateView(); return; }
    close();
    if (result?.ok) toast(desk ? `Sent ${n} sheet${n > 1 ? 's' : ''} to ${printer}` : 'Print window closed');
    else if (/cancel/i.test(result?.reason || '')) toast('Printing cancelled');
    else toast(`Couldn't print: ${result?.reason || 'unknown error'}`, true);
  }

  document.body.appendChild(bg);
  syncUI(); recompute();
  q('#prGo').focus({ preventScroll:true });
}
function printArea(){
  let a = document.getElementById('printArea');
  if (!a) { a = document.createElement('div'); a.id = 'printArea'; document.body.appendChild(a); }
  return a;
}

window.SastraPrint = { PAPERS, pickPages, planSheets, drawSheet, open };
})();

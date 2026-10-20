# Reduce File Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Save as Reduced Size PDF…" in a new Save ▾ list and "Reduce file size" in the File Explorer menu, shrinking
PDFs the way Acrobat's Reduce File Size does.

**Architecture:** One shared classic script `app/reduce.js` (`window.SastraReduce`) does the work with pdf-lib and the
browser's canvas: pictures over 225 ppi go to 150 ppi, pictures become JPEG 0.75 when that is ≥ 10 % smaller, plain
streams get Flate, thumbnails / private data / unused objects go, object streams pack the rest. The main window calls it
from a split Save button (and ☰ File); the Explorer menu DLL gets a `reduce` task that the task window runs.
Spec: `docs/superpowers/specs/2026-10-20-reduce-size-design.md`.

**Tech Stack:** Electron 44, pdf-lib 1.17.1 (bundles pako), pdf.js 6.4.299 (tests only), C++ IExplorerCommand DLL
(MSVC), Playwright (playwright-core 1.48.2) driving Electron for tests.

## Global Constraints

- Work on `main` only; commit after each task; never push or release without asking.
- No new libraries, no network. UI text exactly as written in this plan.
- File name of a reduced copy: `<name without .pdf>_reduced.pdf` (any `.pdf` case stripped; no `.pdf` → just add `_reduced.pdf`).
- Pictures: only 8-bit grey/RGB (`DeviceGray`, `DeviceRGB`, `ICCBased` N = 1 or 3), `DCTDecode` or `FlateDecode`
  (no predictor or a PNG predictor ≥ 10), no `/Decode`, no `/Mask`, stored in ≥ 20 KB; soft masks (`/SMask`) are never
  JPEG'd — a resized picture's mask is resized to the same size and stored Flate. CMYK, Indexed, Lab, JPEG 2000, JBIG2,
  CCITT and 1-bit pictures are left exactly as they are.
- Resample when sharper than 225 ppi across the page's longest side → 150 ppi on that side. JPEG quality 0.75.
  A new picture replaces the old only when ≥ 10 % smaller. The whole file: no copy unless ≥ 1 % smaller.
- Text, fonts, lines, links, bookmarks, form fields, comments: not changed (`updateFieldAppearances:false`).
- The Save window for a reduced copy ALWAYS starts in the open file's own folder (the user's wish); a file with no path
  yet uses `d.saveDir`, else the remembered save folder. The open tab stays the original file.
- The Explorer menu entry changes only the DLL: no manifest change, no `PKG_VERSION` bump.
- Launching Electron from a Claude shell needs `unset ELECTRON_RUN_AS_NODE` first.
- The user's Khmer PDFs are read in place, read-only, never copied; their reduced copies stay in the test folder.

## Paths used below

- `APP` = `E:\_httdocs\SastraPDF` (the repo).
- `T` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\c2983e9f-c627-43c6-9568-026975cadb1b\scratchpad\t`
  (Git Bash: `/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/c2983e9f-c627-43c6-9568-026975cadb1b/scratchpad/t`).
  Made by Task 1 Step 1 of `docs/superpowers/plans/2026-10-20-sharper-pages.md` (playwright-core, `notes-skip.js`, the
  older suites, `pdfs\locked.pdf`, `harness\`). If `T\node_modules` is missing, run that step first.

---

### Task 1: `app/reduce.js` — packing and clean-up

**Files:**
- Create: `app/reduce.js`
- Modify: `app/index.html` (script tags, line ~560), `app/task.html` (script tags, line ~61)
- Create (tests): `T\reduce-fixtures.js`, `T\reduce-test.js`

**Interfaces:**
- Consumes: `window.PDFLib` (pdf-lib), loaded before it.
- Produces: `window.SastraReduce = { reduce, reducedName }`:
  - `reduce(bytes: Uint8Array, { onStep?: ({ i, n }) => void, isCancelled?: () => boolean }) → Promise<{ bytes: Uint8Array|null, before: number, after: number }>`;
    throws `Error` with `.reason` `'protected' | 'damaged' | 'cancelled'`.
  - `reducedName(name: string) → string`.
  - `T\reduce-fixtures.js`: `makeReduceFixtures(page, dir) → Promise<{ text, loose, scan, alpha, mixed, exif, predictor, locked, garbage }>` (file paths).

- [ ] **Step 1: Write the fixtures** — create `T\reduce-fixtures.js`:

```js
// Test PDFs for Reduce file size, made inside the app's own window (canvas + pdf-lib) and written into `dir`:
//   text      pdf-lib text pages (already packed: can't get smaller)
//   loose     plain (unfiltered) page content, a page thumbnail, Illustrator-style private data, an unused object
//   scan      a 300 dpi A4 JPEG "scan" (2480 × 3508) filling the page
//   alpha     a 4000 × 3000 PNG with transparency (Flate + /SMask) drawn 500 × 375 pt on A4
//   mixed     the scan + a 120 × 60 logo (< 20 KB) + a 600 × 600 CMYK picture
//   exif      the scan with an EXIF "turn 90°" tag (PDF viewers ignore it)
//   predictor a 1600 × 1200 RGB picture stored Flate with PNG row filters 0–4 (Predictor 15)
//   locked    password-protected (copied from pdfs\locked.pdf)   garbage  not a PDF
const fs = require('fs'), path = require('path');
async function makeReduceFixtures(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(async D => {
    const { PDFDocument, StandardFonts, PDFName, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
    const save = async (name, doc, opts) => window.sastra.writeFile(D + '\\' + name, await doc.save(opts));
    const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());
    const A4 = [595.28, 841.89];
    async function scanJpeg(w, h) {   // paper, lines of dark text, a little grain
      const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
      x.fillStyle = '#f7f5f0'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = `${Math.round(h / 90)}px serif`;
      for (let y = h / 12; y < h - h / 12; y += h / 60) x.fillText('Lorem ipsum dolor sit amet, consectetur adipiscing elit 2026', w / 12, y);
      const g = x.getImageData(0, 0, w, h), d = g.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      x.putImageData(g, 0, 0);
      return bytesOf(await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 }));
    }
    // a picture stream pdf-lib can't embed itself, placed on a page through the low-level API
    function place(doc, pg, stream, x, y, w, h) {
      const name = pg.node.newXObject('Im', doc.context.register(stream));
      pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(w, 0, 0, h, x, y), drawObject(name), popGraphicsState());
    }
    { const doc = await PDFDocument.create(), f = await doc.embedFont(StandardFonts.Helvetica);
      for (let i = 1; i <= 3; i++) doc.addPage(A4).drawText(`Page ${i}: plain text only`, { x: 50, y: 780, size: 18, font: f });
      await save('text.pdf', doc); }
    { const doc = await PDFDocument.create(), pg = doc.addPage(A4), ctx = doc.context;
      let ops = '0.2 w\n'; for (let i = 0; i < 2000; i++) ops += `${i % 500} ${i % 700} m ${(i * 7) % 595} ${(i * 3) % 842} l S\n`;
      pg.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(ops)));
      pg.node.set(PDFName.of('Thumb'), ctx.register(ctx.stream(new Uint8Array(30000).fill(7), { Type: 'XObject', Subtype: 'Image', Width: 100, Height: 100, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 })));
      pg.node.set(PDFName.of('PieceInfo'), ctx.obj({ Illustrator: { Private: ctx.register(ctx.stream(new Uint8Array(50000).fill(1))) } }));
      ctx.register(ctx.stream(new Uint8Array(80000).fill(3)));   // nothing points to it
      await save('loose.pdf', doc, { useObjectStreams: false }); }
    const scan = await scanJpeg(2480, 3508);
    { const doc = await PDFDocument.create();
      doc.addPage(A4).drawImage(await doc.embedJpg(scan), { x: 0, y: 0, width: A4[0], height: A4[1] });
      await save('scan.pdf', doc); }
    { const w = 4000, h = 3000, c = new OffscreenCanvas(w, h), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2a6'); g.addColorStop(1, '#c42'); x.fillStyle = g;
      x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.45, h * 0.45, 0, 0, Math.PI * 2); x.fill();   // outside it: transparent
      for (let k = 0; k < 400; k++) { x.fillStyle = `hsla(${k * 37 % 360},70%,50%,0.5)`; x.beginPath(); x.arc((k * 97) % w, (k * 57) % h, 40 + k % 60, 0, Math.PI * 2); x.fill(); }
      const doc = await PDFDocument.create(), img = await doc.embedPng(await bytesOf(await c.convertToBlob({ type: 'image/png' })));
      const pg = doc.addPage(A4); pg.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.9, 0.9, 1) });
      pg.drawImage(img, { x: 48, y: 300, width: 500, height: 375 });
      await save('alpha.pdf', doc); }
    { const doc = await PDFDocument.create();
      doc.addPage(A4).drawImage(await doc.embedJpg(scan), { x: 0, y: 0, width: A4[0], height: A4[1] });
      const lc = new OffscreenCanvas(120, 60), lx = lc.getContext('2d'); lx.fillStyle = '#cc2229'; lx.fillRect(0, 0, 120, 60); lx.fillStyle = '#fff'; lx.fillRect(20, 15, 80, 30);
      doc.addPage(A4).drawImage(await doc.embedPng(await bytesOf(await lc.convertToBlob({ type: 'image/png' }))), { x: 50, y: 700, width: 120, height: 60 });
      const cmyk = new Uint8Array(600 * 600 * 4); for (let i = 0; i < cmyk.length; i += 65536) crypto.getRandomValues(cmyk.subarray(i, i + 65536));
      place(doc, doc.addPage(A4), doc.context.flateStream(cmyk, { Type: 'XObject', Subtype: 'Image', Width: 600, Height: 600, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }), 50, 200, 400, 400);
      await save('mixed.pdf', doc); }
    { // EXIF orientation 6 ("turn 90°") right after the JPEG's start marker
      const exif = new Uint8Array([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
      const j = new Uint8Array(scan.length + exif.length); j.set(scan.subarray(0, 2)); j.set(exif, 2); j.set(scan.subarray(2), 2 + exif.length);
      const doc = await PDFDocument.create(); doc.addPage(A4).drawImage(await doc.embedJpg(j), { x: 0, y: 0, width: A4[0], height: A4[1] });
      await save('exif.pdf', doc); }
    { const w = 1600, h = 1200, bpp = 3, rb = w * bpp, raw = new Uint8Array(rb * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * rb + x * 3, n = Math.random() * 40;
        raw[o] = (x / w * 200 + n) | 0; raw[o + 1] = (y / h * 200 + n) | 0; raw[o + 2] = ((x + y) % 256 * 0.5 + n) | 0; }
      const enc = new Uint8Array((rb + 1) * h);
      for (let y = 0; y < h; y++) {
        const t = y % 5, o = y * (rb + 1); enc[o] = t;
        for (let x = 0; x < rb; x++) {
          const v = raw[y * rb + x], a = x >= bpp ? raw[y * rb + x - bpp] : 0, b = y ? raw[(y - 1) * rb + x] : 0, c = x >= bpp && y ? raw[(y - 1) * rb + x - bpp] : 0;
          let p = 0;
          if (t === 1) p = a; else if (t === 2) p = b; else if (t === 3) p = (a + b) >> 1;
          else if (t === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
          enc[o + 1 + x] = (v - p) & 255;
        }
      }
      const doc = await PDFDocument.create();
      place(doc, doc.addPage(A4), doc.context.flateStream(enc, { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: w } }), 0, 0, A4[0], A4[1]);
      await save('predictor.pdf', doc); }
  }, dir);
  fs.copyFileSync(path.join(__dirname, 'pdfs', 'locked.pdf'), path.join(dir, 'locked.pdf'));
  fs.writeFileSync(path.join(dir, 'garbage.pdf'), 'This is not a PDF, just text with a .pdf name.\n'.repeat(50));
  const F = {}; for (const n of ['text', 'loose', 'scan', 'alpha', 'mixed', 'exif', 'predictor', 'locked', 'garbage']) F[n] = path.join(dir, n + '.pdf');
  return F;
}
module.exports = { makeReduceFixtures };
```

- [ ] **Step 2: Write the test** — create `T\reduce-test.js` (all three sections now; `pictures` and `khmer` pass after Task 2):

```js
// Reduce file size (spec 2026-10-20-reduce-size-design.md A): window.SastraReduce in the app's own window.
// Sections: node reduce-test.js [pack] [pictures] [khmer]   (no args = all). PACKED=1 tests dist\win-unpacked.
// Fixtures (reduce-fixtures.js) in out-reduce\in, results in out-reduce\out. The user's Khmer PDFs are read in place.
const { _electron } = require('playwright-core');
const { PDFDocument, PDFName, PDFRawStream, PDFRef } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { makeReduceFixtures } = require('./reduce-fixtures');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const IN = path.join(T, 'out-reduce', 'in'), OUT = path.join(T, 'out-reduce', 'out'), UD = path.join(T, 'ud-reduce');
const KHMER = [
  'E:/_httdocs/PAS Financial Report/Financial Statements 2022 EnY/1. EnY_PAS_Q1_Interim_Financial_Statetments_31_Mar_22_KH.pdf',
  'E:/_httdocs/PAS Financial Report/Financial Statements 2015 PwC/5. PwC_PAS_Audited_Financial_Statements_31_Dec_15_KH.pdf'
];
const want = process.argv.slice(2), on = s => !want.length || want.includes(s);
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const N = n => PDFName.of(n);

// every picture in a file: object, size, filter, colour space, mask and a hash of its stored bytes
async function picturesOf(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
  return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(N('Subtype')) === N('Image')).map(([ref, o]) => {
    const f = o.dict.lookup(N('Filter')), cs = o.dict.lookup(N('ColorSpace')), sm = o.dict.get(N('SMask'));
    return { ref: ref.tag, w: o.dict.lookup(N('Width')).asNumber(), h: o.dict.lookup(N('Height')).asNumber(), filter: f ? String(f) : '', cs: cs ? String(cs) : '',
      smask: sm instanceof PDFRef ? sm.tag : '', len: o.contents.length, sha: crypto.createHash('sha1').update(o.contents).digest('hex') };
  });
}
// SastraReduce.reduce on a file inside the app; a result is written to OUT\<out or the file's name>
const reduceFile = (page, file, opts = {}) => page.evaluate(async ({ file, outFile, cancel }) => {
  const f = await window.sastra.readFile(file); if (f.error) return { error: f.error };
  const steps = [];
  try {
    const r = await SastraReduce.reduce(new Uint8Array(f.data), { onStep: s => steps.push(s), isCancelled: () => cancel });
    if (r.bytes) await window.sastra.writeFile(outFile, r.bytes);
    return { written: !!r.bytes, before: r.before, after: r.after, steps };
  } catch (e) { return { reason: e.reason || 'thrown: ' + e.message, steps }; }
}, { file, outFile: path.join(OUT, opts.out || path.basename(file)), cancel: !!opts.cancel });
// pdf.js on two files: page counts, same text?, and per first page the mean difference of the pictures (0–255, 72 dpi)
const compare = (page, a, b, pages = 3) => page.evaluate(async ({ a, b, pages }) => {
  const lib = await SastraOps.pdfjs();
  const open = async p => { const f = await window.sastra.readFile(p); const t = lib.getDocument({ data: new Uint8Array(f.data), ...SastraOps.PDFJS_OPTS }); return { t, doc: await t.promise }; };
  const A = await open(a), B = await open(b);
  const text = async doc => { const out = []; for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join('')); return out.join('\n'); };
  const pixels = async (doc, i) => {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1 }), c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: x, viewport: vp }).promise; return x.getImageData(0, 0, c.width, c.height).data;
  };
  const diffs = [];
  for (let i = 1; i <= Math.min(pages, A.doc.numPages, B.doc.numPages); i++) {
    const p = await pixels(A.doc, i), q = await pixels(B.doc, i); let s = 0;
    if (p.length !== q.length) { diffs.push(-1); continue; }
    for (let k = 0; k < p.length; k += 4) s += Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]);
    diffs.push(+(s / (p.length / 4) / 3).toFixed(2));
  }
  const r = { na: A.doc.numPages, nb: B.doc.numPages, textSame: await text(A.doc) === await text(B.doc), diffs };
  A.t.destroy(); B.t.destroy(); return r;
}, { a, b, pages });

(async () => {
  for (const d of [path.join(T, 'out-reduce'), UD]) fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD], env });
  const page = await app.firstWindow(); await page.waitForLoadState('load');
  await require('./notes-skip')(page);   // fresh profile: What's new opens once
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const F = await makeReduceFixtures(page, IN);
  check('fixture locked.pdf is password-protected', (await PDFDocument.load(fs.readFileSync(F.locked), { ignoreEncryption: true })).isEncrypted);
  check('SastraReduce is loaded in the main window', await page.evaluate(() => typeof window.SastraReduce?.reduce === 'function'));

  if (on('pack')) {
    const names = await page.evaluate(() => ['Report.pdf', 'A.PDF', 'notes', 'ឯកសារ.pdf'].map(n => SastraReduce.reducedName(n))).catch(e => [e.message]);
    check('reducedName', names.join('|') === 'Report_reduced.pdf|A_reduced.pdf|notes_reduced.pdf|ឯកសារ_reduced.pdf', names.join('|'));
    let r = await reduceFile(page, F.text);
    check('text only: not smaller → no copy', r.written === false && r.after > 0, r);
    r = await reduceFile(page, F.loose);
    check('loose file: less than half the size', r.written && r.after < r.before * 0.5, r);
    if (r.written) {
      const out = path.join(OUT, 'loose.pdf'), doc = await PDFDocument.load(fs.readFileSync(out)), pg = doc.getPage(0).node;
      check('loose: page thumbnail and private data removed', !pg.has(N('Thumb')) && !pg.has(N('PieceInfo')));
      const contents = pg.lookup(N('Contents'));
      check('loose: page content now Flate-compressed', contents instanceof PDFRawStream && contents.dict.lookup(N('Filter')) === N('FlateDecode'), String(contents?.dict?.lookup(N('Filter'))));
      const src = await PDFDocument.load(fs.readFileSync(F.loose)), a = src.context.enumerateIndirectObjects().length, b = doc.context.enumerateIndirectObjects().length;
      check('loose: unused objects dropped', b < a - 2, `${a} → ${b}`);
      const c = await compare(page, F.loose, out, 1);
      check('loose: the page is the same, pixel for pixel', c.na === c.nb && c.diffs[0] === 0, c);
    }
    r = await reduceFile(page, F.locked); check('password-protected → reason "protected"', r.reason === 'protected', r);
    r = await reduceFile(page, F.garbage); check('not a PDF → reason "damaged"', r.reason === 'damaged', r);
  }

  if (on('pictures')) {
    const k = (long, px) => (long / 72 * 150) / px;   // resample factor to 150 ppi across the page's long side
    const sk = k(841.89, 3508);
    let r = await reduceFile(page, F.scan);
    check('scan: smaller', r.written && r.after < r.before * 0.6, r);
    check('scan: one picture step reported', JSON.stringify(r.steps) === '[{"i":1,"n":1}]', r.steps);
    let ps = r.written ? await picturesOf(path.join(OUT, 'scan.pdf')) : [];
    check('scan: picture now 150 ppi, JPEG', ps.length === 1 && ps[0].w === Math.round(2480 * sk) && ps[0].h === Math.round(3508 * sk) && ps[0].filter === '/DCTDecode', ps);
    let c = r.written ? await compare(page, F.scan, path.join(OUT, 'scan.pdf'), 1) : null;
    check('scan: looks the same (mean difference < 6)', c && c.diffs[0] >= 0 && c.diffs[0] < 6, c);

    r = await reduceFile(page, F.alpha);
    ps = r.written ? await picturesOf(path.join(OUT, 'alpha.pdf')) : [];
    const ak = k(841.89, 4000), base = ps.find(p => p.smask), mask = base && ps.find(p => p.ref === base.smask);
    check('transparent photo: picture resized to 150 ppi, JPEG', r.written && base && base.w === Math.round(4000 * ak) && base.h === Math.round(3000 * ak) && base.filter === '/DCTDecode', { r, base });
    check('transparent photo: its mask resized to the same size, lossless', !!mask && mask.w === base.w && mask.h === base.h && mask.filter === '/FlateDecode', mask);
    c = r.written ? await compare(page, F.alpha, path.join(OUT, 'alpha.pdf'), 1) : null;
    check('transparent photo: looks the same (mean difference < 6)', c && c.diffs[0] >= 0 && c.diffs[0] < 6, c);

    const before = await picturesOf(F.mixed);
    r = await reduceFile(page, F.mixed);
    const after = r.written ? await picturesOf(path.join(OUT, 'mixed.pdf')) : [];
    const same = pred => { const a = before.find(pred), b = after.find(pred); return !!(a && b && a.sha === b.sha); };
    check('mixed: only the scan counted as a picture to redo', JSON.stringify(r.steps) === '[{"i":1,"n":1}]', r.steps);
    check('mixed: small logo (< 20 KB) unchanged byte for byte', same(p => p.w === 120 && p.h === 60));
    check('mixed: CMYK picture unchanged byte for byte', same(p => p.cs === '/DeviceCMYK'));

    r = await reduceFile(page, F.exif);
    ps = r.written ? await picturesOf(path.join(OUT, 'exif.pdf')) : [];
    check('JPEG with an EXIF "turn" tag: kept as PDF viewers show it (not turned)', ps.length === 1 && ps[0].w === Math.round(2480 * sk) && ps[0].h === Math.round(3508 * sk), ps);
    c = r.written ? await compare(page, F.exif, path.join(OUT, 'exif.pdf'), 1) : null;
    check('JPEG with an EXIF tag: looks the same in pdf.js', c && c.diffs[0] >= 0 && c.diffs[0] < 6, c);

    r = await reduceFile(page, F.predictor);
    ps = r.written ? await picturesOf(path.join(OUT, 'predictor.pdf')) : [];
    check('Flate picture with PNG row filters: JPEG at its own size (137 ppi: not resized)', r.written && ps.length === 1 && ps[0].w === 1600 && ps[0].h === 1200 && ps[0].filter === '/DCTDecode', { r, ps });
    c = r.written ? await compare(page, F.predictor, path.join(OUT, 'predictor.pdf'), 1) : null;
    check('PNG row filters undone right (looks the same, mean difference < 6)', c && c.diffs[0] >= 0 && c.diffs[0] < 6, c);

    r = await reduceFile(page, F.scan, { cancel: true, out: 'cancelled.pdf' });
    check('cancelled → reason "cancelled", nothing written', r.reason === 'cancelled' && !fs.existsSync(path.join(OUT, 'cancelled.pdf')), r);
  }

  if (on('khmer')) for (const [i, f] of KHMER.entries()) {
    const name = path.basename(f), out = `kh-${i}.pdf`, r = await reduceFile(page, f, { out });
    if (r.reason || r.error) { check(`${name}: reduced`, false, r); continue; }
    console.log(`      ${name}: ${(r.before / 1048576).toFixed(2)} MB → ${(r.after / 1048576).toFixed(2)} MB${r.written ? '' : ' (not smaller: no copy)'}, ${r.steps.length} pictures redone`);
    if (!r.written) { check(`${name}: not smaller, so no copy`, true); continue; }
    const c = await compare(page, f, path.join(OUT, out), 3);
    check(`${name}: same number of pages`, c.na === c.nb, c);
    check(`${name}: text exactly the same (Khmer included)`, c.textSame);
    check(`${name}: first pages look the same (mean difference < 6)`, c.diffs.every(x => x >= 0 && x < 6), c.diffs);
  }

  check('no page errors', !errors.length, errors.join(' | '));
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-test.js pack`
Expected: the fixture check PASSES; "SastraReduce is loaded" FAILS and every pack check FAILS (`SastraReduce is not defined`).

- [ ] **Step 4: Create `app/reduce.js`** (packing only; Task 2 adds the pictures):

```js
// Sastra PDF — Reduce file size, as Acrobat's File › Save as Other › Reduced Size PDF: plain streams get Flate, page
// thumbnails, other programs' private data and objects nothing uses go, object streams pack the rest. Text, fonts
// (Khmer too), lines, links, bookmarks, forms and comments are not touched. Shared by index.html (Save ▾ › Save as
// Reduced Size PDF…) and task.html (File Explorer › Reduce file size), so both make the same file.
// Spec: docs/superpowers/specs/2026-10-20-reduce-size-design.md
(() => {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream } = PDFLib;
  const N = n => PDFName.of(n);
  const FILE_GAIN = 0.99;   // no copy unless at least 1 % smaller
  const fail = reason => Object.assign(new Error(reason), { reason });

  // "Report.pdf" → "Report_reduced.pdf"
  const reducedName = name => String(name).replace(/\.pdf$/i, '') + '_reduced.pdf';

  // Packing and clean-up: page thumbnails and other programs' private data (/PieceInfo) go, plain streams get Flate (not
  // XML metadata, which tools read as text), and objects nothing points to any more are dropped.
  function tidy(doc){
    const ctx = doc.context;
    for (const p of doc.getPages()) { p.node.delete(N('Thumb')); p.node.delete(N('PieceInfo')); }
    doc.catalog.delete(N('PieceInfo'));
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.has(N('Filter')) || obj.dict.lookup(N('Type')) === N('Metadata') || obj.contents.length < 64) continue;
      const packed = ctx.flateStream(obj.contents);
      for (const [k, v] of obj.dict.entries()) if (k !== N('Length') && k !== N('Filter')) packed.dict.set(k, v);
      if (packed.contents.length < obj.contents.length) ctx.assign(ref, packed);
    }
    const keep = new Set(), todo = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
    while (todo.length) {
      const o = todo.pop();
      if (o instanceof PDFRef) { if (!keep.has(o.tag)) { keep.add(o.tag); todo.push(ctx.lookup(o)); } }
      else if (o instanceof PDFDict) for (const [, v] of o.entries()) todo.push(v);
      else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) todo.push(o.get(i));
      else if (o instanceof PDFStream) todo.push(o.dict);
    }
    for (const [ref] of ctx.enumerateIndirectObjects()) if (!keep.has(ref.tag)) ctx.delete(ref);
  }

  async function reduce(bytes, { onStep = () => {}, isCancelled = () => false } = {}){
    const before = bytes.byteLength;
    let doc;
    try { doc = await PDFDocument.load(bytes, { ignoreEncryption:true, updateMetadata:false }); } catch { throw fail('damaged'); }
    if (doc.isEncrypted) throw fail('protected');
    try {
      if (isCancelled()) throw fail('cancelled');
      tidy(doc);
      const out = await doc.save({ useObjectStreams:true, updateFieldAppearances:false });
      return { bytes: out.length <= before * FILE_GAIN ? out : null, before, after: out.length };
    } catch (e) { throw e?.reason ? e : fail('damaged'); }
  }

  window.SastraReduce = { reduce, reducedName };
})();
```

- [ ] **Step 5: Load it in both windows**

In `app/index.html` replace
```html
<script src="images.js"></script>
```
with
```html
<script src="images.js"></script>
<script src="reduce.js"></script>
```
In `app/task.html` replace
```html
<script src="pdfops.js"></script>
<script src="task.js"></script>
```
with
```html
<script src="pdfops.js"></script>
<script src="reduce.js"></script>
<script src="task.js"></script>
```

- [ ] **Step 6: Run the pack section to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-test.js pack`
Expected: `ALL PASS` (fixture, loaded, reducedName, text-only no copy, loose ×5, protected, damaged, no page errors).

- [ ] **Step 7: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/reduce.js app/index.html app/task.html && git commit -m "feat: reduce.js — pack and clean a PDF (Flate, no thumbnails/private data/unused objects, object streams)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `app/reduce.js` — pictures

**Files:**
- Modify: `app/reduce.js` (replace the whole file with the version below)
- Test: `T\reduce-test.js` (sections `pictures`, `khmer`; written in Task 1)

**Interfaces:**
- Consumes: Task 1's `SastraReduce` shape and `T\reduce-fixtures.js`.
- Produces: the same `window.SastraReduce = { reduce, reducedName }`; `onStep({ i, n })` is now called once per picture
  to redo (`n` = how many), before it; `isCancelled()` is checked before each picture and once after the last.

- [ ] **Step 1: Run the picture sections to see them fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-test.js pictures khmer`
Expected: FAIL on "scan: smaller", "scan: one picture step", "picture now 150 ppi", the transparent-photo, EXIF and
predictor checks (pictures are untouched); the Khmer files report "not smaller" or a small gain.

- [ ] **Step 2: Replace `app/reduce.js`** with the complete version:

```js
// Sastra PDF — Reduce file size, as Acrobat's File › Save as Other › Reduced Size PDF. Pictures sharper than they need
// to be (over 225 ppi across their page) are resampled to 150 ppi; pictures are saved as JPEG (quality 0.75, Acrobat's
// "medium") when that is at least 10 % smaller; plain streams get Flate; page thumbnails, other programs' private data
// and objects nothing uses go; object streams pack the rest. Text, fonts (Khmer too), lines, links, bookmarks, forms and
// comments are not touched. Shared by index.html (Save ▾ › Save as Reduced Size PDF…) and task.html (File Explorer ›
// Reduce file size), so both make the same file. Spec: docs/superpowers/specs/2026-10-20-reduce-size-design.md
(() => {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFRawStream, PDFNumber, decodePDFRawStream } = PDFLib;
  const N = n => PDFName.of(n);
  const ABOVE_PPI = 225, TO_PPI = 150, QUALITY = 0.75, MIN_BYTES = 20 * 1024, PICTURE_GAIN = 0.9, FILE_GAIN = 0.99;
  const fail = reason => Object.assign(new Error(reason), { reason });
  const num = (dict, key) => { const v = dict.lookup(N(key)); return v instanceof PDFNumber ? v.asNumber() : undefined; };

  // "Report.pdf" → "Report_reduced.pdf"
  const reducedName = name => String(name).replace(/\.pdf$/i, '') + '_reduced.pdf';

  // For each picture (by object), the longest side in points of the largest page it is drawn on — pictures inside Form
  // XObjects count for the page that draws the form.
  function pageSides(doc){
    const side = new Map(), seen = new Set();
    const walk = (res, long) => {
      const xo = res instanceof PDFDict ? res.lookup(N('XObject')) : null;
      if (!(xo instanceof PDFDict)) return;
      for (const [, v] of xo.entries()) {
        if (!(v instanceof PDFRef)) continue;
        const s = doc.context.lookup(v); if (!(s instanceof PDFStream)) continue;
        const sub = s.dict.lookup(N('Subtype'));
        if (sub === N('Image')) side.set(v.tag, Math.max(side.get(v.tag) || 0, long));
        else if (sub === N('Form') && !seen.has(v.tag + '@' + long)) { seen.add(v.tag + '@' + long); walk(s.dict.lookup(N('Resources')), long); }
      }
    };
    for (const p of doc.getPages()) { const { width, height } = p.getSize(); walk(p.node.Resources(), Math.max(width, height)); }
    return side;
  }

  // colour components of a picture's colour space: 1 (grey) or 3 (RGB); 0 = leave it (CMYK, Indexed, Lab…)
  function colours(cs){
    if (cs === N('DeviceRGB')) return 3;
    if (cs === N('DeviceGray')) return 1;
    if (cs instanceof PDFArray && cs.size() === 2 && cs.lookup(0) === N('ICCBased')) {
      const s = cs.lookup(1), n = s instanceof PDFStream ? num(s.dict, 'N') : 0;
      return n === 1 || n === 3 ? n : 0;
    }
    return 0;
  }

  // a JPEG's size and colour components, from its frame header (SOFn); null if it can't be read or isn't 8-bit
  function jpegInfo(b){
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xFF) return null;
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
        return b[i + 4] === 8 ? { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] } : null;
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }

  // How a picture can be redone, or null: 8 bits a component, grey or RGB, JPEG or Flate (no predictor or a PNG one),
  // no colour-key /Mask or /Decode array, stored in at least 20 KB (small icons and logos stay as they are).
  // mask: a soft mask (no size floor; grey; may leave out its colour space).
  function plan(stream, { mask = false } = {}){
    const d = stream.dict;
    if (d.lookup(N('Subtype')) !== N('Image') || (!mask && stream.contents.length < MIN_BYTES)) return null;
    if (num(d, 'BitsPerComponent') !== 8 || d.has(N('Decode')) || d.has(N('Mask'))) return null;
    const w = num(d, 'Width'), h = num(d, 'Height'); if (!(w > 0 && h > 0)) return null;
    const cs = d.lookup(N('ColorSpace')), comps = mask && !cs ? 1 : colours(cs);
    if (!comps || (mask && comps !== 1)) return null;
    let f = d.lookup(N('Filter')), p = d.lookup(N('DecodeParms'));
    if (f instanceof PDFArray) { if (f.size() !== 1) return null; f = f.lookup(0); p = p instanceof PDFArray ? p.lookup(0) : p; }
    if (f === N('DCTDecode')) { const j = jpegInfo(stream.contents); return j && j.comps === comps && j.w === w && j.h === h ? { kind:'jpeg', w, h, comps } : null; }
    if (f !== N('FlateDecode')) return null;
    const pred = p instanceof PDFDict ? num(p, 'Predictor') ?? 1 : 1;
    if (pred === 1) return { kind:'flate', w, h, comps, png:false };
    if (pred < 10 || (num(p, 'Colors') ?? 1) !== comps || (num(p, 'BitsPerComponent') ?? 8) !== 8 || (num(p, 'Columns') ?? 1) !== w) return null;
    return { kind:'flate', w, h, comps, png:true };
  }

  // undo PNG row filters (Predictor ≥ 10): each row is a filter byte (0 none, 1 sub, 2 up, 3 average, 4 Paeth) + the row
  function unPng(src, rowBytes, rows, bpp){
    if (src.length < (rowBytes + 1) * rows) throw new Error('short picture data');
    const out = new Uint8Array(rowBytes * rows);
    for (let y = 0; y < rows; y++) {
      const t = src[y * (rowBytes + 1)], s = y * (rowBytes + 1) + 1, o = y * rowBytes, up = o - rowBytes;
      for (let x = 0; x < rowBytes; x++) {
        const a = x >= bpp ? out[o + x - bpp] : 0, b = y ? out[up + x] : 0, c = x >= bpp && y ? out[up + x - bpp] : 0;
        let v = src[s + x];
        if (t === 1) v += a; else if (t === 2) v += b; else if (t === 3) v += (a + b) >> 1;
        else if (t === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        out[o + x] = v;   // Uint8Array keeps it mod 256
      }
    }
    return out;
  }

  // grey or RGB bytes → ImageData (RGBA, opaque)
  function rgba(px, w, h, comps){
    const img = new ImageData(w, h), d = img.data;
    for (let i = 0, j = 0, k = 0; i < w * h; i++, j += comps, k += 4) {
      d[k] = px[j]; d[k + 1] = px[comps === 3 ? j + 1 : j]; d[k + 2] = px[comps === 3 ? j + 2 : j]; d[k + 3] = 255;
    }
    return img;
  }

  // the picture's pixels, resized to `size` with Chromium's high-quality resampling. EXIF orientation and a JPEG's own
  // colour profile are ignored, as PDF viewers do.
  async function bitmapOf(stream, p, size){
    const opts = { imageOrientation:'none', colorSpaceConversion:'none', resizeWidth:size.w, resizeHeight:size.h, resizeQuality:'high' };
    if (p.kind === 'jpeg') return createImageBitmap(new Blob([stream.contents], { type:'image/jpeg' }), opts);
    const raw = decodePDFRawStream(stream).decode(), px = p.png ? unPng(raw, p.w * p.comps, p.h, p.comps) : raw;
    if (px.length < p.w * p.h * p.comps) throw new Error('short picture data');
    return createImageBitmap(rgba(px, p.w, p.h, p.comps), opts);
  }

  async function jpegOf(bitmap){
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    c.getContext('2d', { alpha:false }).drawImage(bitmap, 0, 0); bitmap.close();
    return new Uint8Array(await (await c.convertToBlob({ type:'image/jpeg', quality:QUALITY })).arrayBuffer());
  }

  // a resized picture's soft mask (8-bit grey) at the same size, lossless (Flate); null = leave the picture alone
  async function maskOf(doc, ref, size){
    const m = doc.context.lookup(ref);
    if (!(m instanceof PDFRawStream) || m.dict.has(N('Matte'))) return null;
    const p = plan(m, { mask:true }); if (!p) return null;
    const bmp = await bitmapOf(m, p, size), c = new OffscreenCanvas(size.w, size.h), x = c.getContext('2d');
    x.drawImage(bmp, 0, 0); bmp.close();
    const d = x.getImageData(0, 0, size.w, size.h).data, grey = new Uint8Array(size.w * size.h);
    for (let i = 0; i < grey.length; i++) grey[i] = d[i * 4];
    return doc.context.flateStream(grey, { Type:'XObject', Subtype:'Image', Width:size.w, Height:size.h, ColorSpace:'DeviceGray', BitsPerComponent:8 });
  }

  // the same object with new contents: the dictionary's other keys (/SMask, /Intent, /Interpolate, /Metadata…) stay
  function restream(doc, ref, old, bytes, set){
    const dict = old.dict.clone(doc.context);
    for (const k of ['Filter', 'DecodeParms', 'Length', 'DL']) dict.delete(N(k));
    for (const [k, v] of Object.entries(set)) dict.set(N(k), doc.context.obj(v));
    doc.context.assign(ref, PDFRawStream.of(dict, bytes));
  }

  // one picture: resample past 225 ppi to 150 ppi (on the page's long side), save as JPEG; kept only if ≥ 10 % smaller
  async function shrink(doc, ref, stream, p, long){
    const inches = long / 72, longPx = Math.max(p.w, p.h);
    let size = { w:p.w, h:p.h };
    if (longPx > inches * ABOVE_PPI) { const k = inches * TO_PPI / longPx; size = { w:Math.max(1, Math.round(p.w * k)), h:Math.max(1, Math.round(p.h * k)) }; }
    const resized = size.w !== p.w || size.h !== p.h, sm = stream.dict.get(N('SMask'));
    let mask = null;
    if (resized && sm) { if (!(sm instanceof PDFRef) || !(mask = await maskOf(doc, sm, size))) return; }
    const jpg = await jpegOf(await bitmapOf(stream, p, size));
    if (jpg.length > stream.contents.length * PICTURE_GAIN) return;
    restream(doc, ref, stream, jpg, { Width:size.w, Height:size.h, ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode' });
    if (mask) doc.context.assign(sm, mask);
  }

  // Packing and clean-up: page thumbnails and other programs' private data (/PieceInfo) go, plain streams get Flate (not
  // XML metadata, which tools read as text), and objects nothing points to any more are dropped.
  function tidy(doc){
    const ctx = doc.context;
    for (const p of doc.getPages()) { p.node.delete(N('Thumb')); p.node.delete(N('PieceInfo')); }
    doc.catalog.delete(N('PieceInfo'));
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || obj.dict.has(N('Filter')) || obj.dict.lookup(N('Type')) === N('Metadata') || obj.contents.length < 64) continue;
      const packed = ctx.flateStream(obj.contents);
      for (const [k, v] of obj.dict.entries()) if (k !== N('Length') && k !== N('Filter')) packed.dict.set(k, v);
      if (packed.contents.length < obj.contents.length) ctx.assign(ref, packed);
    }
    const keep = new Set(), todo = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
    while (todo.length) {
      const o = todo.pop();
      if (o instanceof PDFRef) { if (!keep.has(o.tag)) { keep.add(o.tag); todo.push(ctx.lookup(o)); } }
      else if (o instanceof PDFDict) for (const [, v] of o.entries()) todo.push(v);
      else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) todo.push(o.get(i));
      else if (o instanceof PDFStream) todo.push(o.dict);
    }
    for (const [ref] of ctx.enumerateIndirectObjects()) if (!keep.has(ref.tag)) ctx.delete(ref);
  }

  // → { bytes (null when not at least 1 % smaller), before, after }; throws .reason 'protected' | 'damaged' | 'cancelled'.
  // Pictures are done one at a time and each bitmap is closed at once, so a long scan doesn't fill memory.
  async function reduce(bytes, { onStep = () => {}, isCancelled = () => false } = {}){
    const before = bytes.byteLength;
    let doc;
    try { doc = await PDFDocument.load(bytes, { ignoreEncryption:true, updateMetadata:false }); } catch { throw fail('damaged'); }
    if (doc.isEncrypted) throw fail('protected');
    try {
      const sides = pageSides(doc), largest = Math.max(72, ...doc.getPages().map(p => { const s = p.getSize(); return Math.max(s.width, s.height); }));
      const masks = new Set(), jobs = [];
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        const sm = obj instanceof PDFStream ? obj.dict.get(N('SMask')) : null;
        if (sm instanceof PDFRef) masks.add(sm.tag);   // soft masks are never JPEG'd on their own
      }
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream) || masks.has(ref.tag)) continue;
        const p = plan(obj); if (p) jobs.push({ ref, obj, p });
      }
      for (const [k, j] of jobs.entries()) {
        if (isCancelled()) throw fail('cancelled');
        onStep({ i:k + 1, n:jobs.length });
        try { await shrink(doc, j.ref, j.obj, j.p, sides.get(j.ref.tag) || largest); } catch { /* this picture stays as it was */ }
      }
      if (isCancelled()) throw fail('cancelled');
      tidy(doc);
      const out = await doc.save({ useObjectStreams:true, updateFieldAppearances:false });
      return { bytes: out.length <= before * FILE_GAIN ? out : null, before, after: out.length };
    } catch (e) { throw e?.reason ? e : fail('damaged'); }
  }

  window.SastraReduce = { reduce, reducedName };
})();
```

- [ ] **Step 3: Run every section to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-test.js`
Expected: `ALL PASS`. The Khmer lines print each file's sizes (a "not smaller, so no copy" line is a PASS).
If "JPEG with an EXIF tag: looks the same in pdf.js" fails while the size check passes, pdf.js turns EXIF-tagged JPEGs
and the file is still right (PDF viewers must ignore EXIF) — report it instead of changing reduce.js.

- [ ] **Step 4: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/reduce.js && git commit -m "feat: reduce.js — pictures over 225 ppi to 150 ppi, JPEG when 10 % smaller, masks kept lossless (as Acrobat)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Save ▾ in the menubar, Save as Reduced Size PDF…, ☰ File item

**Files:**
- Modify: `app/index.html` (menubar HTML line ~442; CSS after line 74 and the media steps lines 104–108;
  `saveAsActive` ~line 1574; `updateUI` list ~line 1615; `desk.onMenu` map ~line 1981; the right-click menu code ~line 1761)
- Modify: `main.js` (File menu ~line 167; `save-dialog` title ~line 264)
- Modify: `CLAUDE.md` ("Layout" thresholds, a Save ▾ bullet)
- Create (tests): `T\save-menu-test.js`

**Interfaces:**
- Consumes: `SastraReduce.reduce`, `SastraReduce.reducedName` (Tasks 1–2); `fmtBytes`, `busy`, `toast`, `saveFile`,
  `saveActive`, `saveAsActive`, `closeMenu`, `cmenu` in index.html; `desk.saveDialog(name, data, kind, dir)`.
- Produces: `saveReducedActive()` in index.html; menu command `'saveReduced'`; save-dialog kind `'reduced'`.

- [ ] **Step 1: Write the failing test** — create `T\save-menu-test.js`:

```js
// Save ▾ (spec 2026-10-20-reduce-size-design.md B): the arrow next to Save lists Save / Save As… / Save as Reduced
// Size PDF…; mouse and keys; disabled with no PDF, hidden while maximized. Save as Reduced Size PDF suggests
// "<name>_reduced.pdf" in the OPEN FILE'S folder (not the remembered one), says how much smaller, keeps the tab; a file
// that can't get smaller → a message, no Save window. ☰ File has it. The logo row still fits at each width step.
// Windows' Save dialog answers by itself (main's real handler runs). PACKED=1 tests dist\win-unpacked.
const { _electron } = require('playwright-core');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { makeReduceFixtures } = require('./reduce-fixtures');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const OUT = path.join(T, 'out-savemenu'), UD = path.join(T, 'ud-savemenu'), SRC = path.join(OUT, 'src'), ELSE = path.join(OUT, 'elsewhere');
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const STEPS = ['.menubar .btn .lbl', '#bFitW,#bFitP', '.menubar .brand-km', '#bZoomOut,#bZoomIn', '#bPrev,#bNext'];
const TH = [1638, 1384, 1316, 1263, 1195];   // app/index.html's @media (max-width:…) that hides each step

(async () => {
  for (const d of [OUT, UD]) fs.rmSync(d, { recursive: true, force: true });
  for (const d of [SRC, ELSE, UD]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(UD, 'folders.json'), JSON.stringify({ open: ELSE, save: ELSE }));   // remembered folder ≠ the file's
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD], env });
  const page = await app.firstWindow(); await page.waitForLoadState('load');
  await require('./notes-skip')(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const F = await makeReduceFixtures(page, SRC);
  await app.evaluate(({ dialog }) => {
    globalThis.__saves = []; globalThis.__saveTo = null;
    dialog.showSaveDialog = async (_w, o) => { globalThis.__saves.push({ title: o.title, defaultPath: o.defaultPath }); const to = globalThis.__saveTo; return to ? { canceled: false, filePath: to } : { canceled: true }; };
  });
  const saveTo = f => app.evaluate((_e, f) => { globalThis.__saveTo = f; }, f);
  const saves = () => app.evaluate(() => globalThis.__saves);
  const second = args => new Promise(res => { const p = spawn(EXE, [...PRE, '--user-data-dir=' + UD, ...args], { env, stdio: 'ignore' }); p.on('exit', res); });
  const tabs = () => page.evaluate(() => [...document.querySelectorAll('#tabstrip .tab')].map(t => t.textContent.trim()));
  const toast = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
  const st = () => page.evaluate(() => ({ save: document.querySelector('#bSave').disabled, more: document.querySelector('#bSaveMore')?.disabled, shown: !!document.querySelector('#bSaveMore')?.offsetParent }));
  const menu = () => page.evaluate(() => { const m = document.querySelector('.cmenu.savemenu'); return m ? { items: [...m.querySelectorAll('.ci')].map(b => b.children[1].textContent + '|' + b.querySelector('.kb').textContent), focus: m.contains(document.activeElement) ? document.activeElement.textContent : null, expanded: document.querySelector('#bSaveMore').getAttribute('aria-expanded') } : null; });
  const item = n => page.locator('.cmenu.savemenu .ci').nth(n).click();

  // 1) no PDF: both halves disabled; a PDF: enabled, the arrow right against Save
  let s = await st();
  check('no PDF: Save and its arrow are disabled', s.save === true && s.more === true, s);
  await second([F.scan]); await until(async () => (await tabs()).some(t => t.includes('scan.pdf')));
  s = await st();
  check('a PDF open: both enabled and shown', !s.save && !s.more && s.shown, s);
  const geo = await page.evaluate(() => { const a = document.querySelector('#bSave').getBoundingClientRect(), b = document.querySelector('#bSaveMore').getBoundingClientRect(); return { gap: +(b.left - a.right).toFixed(2), w: +b.width.toFixed(2), same: a.top === b.top && a.height === b.height }; });
  check('the arrow sits right against Save, 20 px wide, same height', Math.abs(geo.gap) < 0.5 && Math.abs(geo.w - 20) < 0.5 && geo.same, geo);

  // 2) the list, by mouse and by keys
  await page.click('#bSaveMore'); let m = await menu();
  check('arrow click: Save / Save As… / Save as Reduced Size PDF…', m?.items.join(' ; ') === 'Save|Ctrl+S ; Save As…|Ctrl+Shift+S ; Save as Reduced Size PDF…|', m);
  check('aria-expanded true while open', m?.expanded === 'true', m);
  await page.click('#bSaveMore'); check('a second click on the arrow closes it', (await menu()) === null);
  await page.click('#bSaveMore'); await page.mouse.click(760, 520); check('a click elsewhere closes it', (await menu()) === null);
  await page.focus('#bSaveMore'); await page.keyboard.press('ArrowDown'); m = await menu();
  check('↓ on the arrow opens it with Save focused', m?.focus === 'SaveCtrl+S', m);
  await page.keyboard.press('ArrowDown'); m = await menu();
  check('↓ moves to Save As…', m?.focus === 'Save As…Ctrl+Shift+S', m);
  await page.keyboard.press('Escape');
  check('Esc closes it, the focus goes back to the arrow', (await menu()) === null && await page.evaluate(() => document.activeElement?.id === 'bSaveMore'));
  await page.keyboard.press('Enter'); m = await menu();
  check('Enter on the arrow opens it with Save focused', m?.focus === 'SaveCtrl+S', m);
  await page.keyboard.press('Escape');

  // 3) Save as Reduced Size PDF…: the file's own folder, the name, the message, the tab unchanged
  await saveTo(path.join(ELSE, 'scan_reduced.pdf'));
  await page.click('#bSaveMore'); await item(2);
  await until(async () => (await saves()).length > 0, 60000);
  const sv = (await saves()).at(-1);
  check('Save window titled "Save as Reduced Size PDF"', sv?.title === 'Save as Reduced Size PDF', sv);
  check("it starts in the open file's own folder with scan_reduced.pdf (not the remembered folder)", sv?.defaultPath === path.join(SRC, 'scan_reduced.pdf'), sv);
  await until(async () => /^Saved scan_reduced\.pdf/.test(await toast()), 10000);
  const t = await toast();
  check('message: Saved scan_reduced.pdf · before → after (N % smaller)', /^Saved scan_reduced\.pdf · [\d.]+ (MB|KB) → [\d.]+ (MB|KB) \(\d+ % smaller\)$/.test(t), t);
  const out = path.join(ELSE, 'scan_reduced.pdf');
  check('the reduced copy is written and smaller', fs.existsSync(out) && fs.statSync(out).size < fs.statSync(F.scan).size * 0.6, fs.existsSync(out) ? fs.statSync(out).size : 'missing');
  check('the tab is still scan.pdf', (await tabs()).some(x => x.includes('scan.pdf')) && !(await tabs()).some(x => x.includes('_reduced')), (await tabs()).join(','));
  check('not marked changed (no "•" in the title)', !(await page.title()).startsWith('•'), await page.title());

  // 4) a file that can't get smaller: a message, no Save window
  await second([F.text]); await until(async () => (await tabs()).some(t => t.includes('text.pdf')));
  const n0 = (await saves()).length;
  await page.click('#bSaveMore'); await item(2);
  await until(async () => /already as small/.test(await toast()), 30000);
  check('"text.pdf is already as small as it can be — no copy made"', (await toast()) === 'text.pdf is already as small as it can be — no copy made', await toast());
  check('… and no Save window', (await saves()).length === n0);

  // 5) Save and Save As… in the list do what the button and the shortcuts do
  const mtime = fs.statSync(F.text).mtimeMs;
  await page.click('#viewer'); await page.keyboard.press('Control+Shift+R');
  await until(async () => (await page.title()).startsWith('•'));
  await page.click('#bSaveMore'); await item(0);
  await until(async () => !(await page.title()).startsWith('•'));
  check('list › Save writes the open file in place (as Ctrl+S)', fs.statSync(F.text).mtimeMs > mtime && !(await page.title()).startsWith('•'));
  await saveTo(path.join(ELSE, 'text-copy.pdf'));
  await page.click('#bSaveMore'); await item(1);
  await until(async () => (await tabs()).some(t => t.includes('text-copy.pdf')));
  check('list › Save As… opens the Save As window (as Ctrl+Shift+S)', (await saves()).at(-1)?.title === 'Save As' && fs.existsSync(path.join(ELSE, 'text-copy.pdf')));

  // 6) ☰ File
  const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map(i => i.label));
  check('☰ File: "Save as Reduced Size PDF…" right after Save As…', labels.indexOf('Save as &Reduced Size PDF…') === labels.indexOf('Save &As…') + 1, labels.join(' | '));
  await page.evaluate(() => [...document.querySelectorAll('#tabstrip .tab')].find(t => t.textContent.includes('scan.pdf'))?.click());
  await saveTo(path.join(ELSE, 'scan_reduced (menu).pdf')); const n1 = (await saves()).length;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'saveReduced'));
  await until(async () => (await saves()).length > n1, 60000);
  check('☰ File › Save as Reduced Size PDF… does the same', (await saves()).at(-1)?.title === 'Save as Reduced Size PDF');

  // 7) maximized: the pair is hidden
  await page.click('#viewer'); await page.keyboard.press('f');
  await until(() => page.evaluate(() => document.querySelector('#app').classList.contains('focus')));
  check('maximized: the Save pair is hidden', await page.evaluate(() => getComputedStyle(document.querySelector('.splitbtn')).display === 'none'));
  await page.keyboard.press('f'); await sleep(400);

  // 8) the logo row fits just above each width step (measured with the steps forced, as widths.js did). The app's own
  // width steps are switched off while measuring (media 'not all'), so the result doesn't depend on this window's width
  // (the user's screen is 1463 px wide at 175 %, under the 1638 step).
  const widths = await page.evaluate(STEPS => {
    document.querySelector('#pageOf').textContent = '/ 9999';   // a long document: the widest page box
    const rules = [...document.styleSheets].flatMap(ss => [...ss.cssRules]).filter(r => r.media && /max-width/.test(r.media.mediaText));
    const was = rules.map(r => r.media.mediaText); rules.forEach(r => { r.media.mediaText = 'not all'; });
    const st = document.createElement('style'); document.head.appendChild(st);
    const m = document.querySelector('.menubar'), out = [];
    for (let s = 0; s < STEPS.length; s++) {
      st.textContent = '.toolbar{flex:0 0 auto!important}' + STEPS.slice(0, s).map(x => x + '{display:none!important}').join('');
      const right = innerWidth - parseFloat(getComputedStyle(m).paddingRight);
      const r = Math.max(...[...m.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect().right));
      out.push(Math.ceil(innerWidth - (right - r)));
    }
    st.remove(); rules.forEach((r, i) => { r.media.mediaText = was[i]; }); return out;
  }, STEPS);
  STEPS.forEach((x, k) => check(`logo row fits above ${TH[k]} px while "${x}" still shows`, widths[k] <= TH[k] + 1, `needs ${widths[k]}`));
  const media = await page.evaluate(() => [...document.styleSheets].flatMap(ss => [...ss.cssRules]).filter(r => r.media).map(r => r.media.mediaText).join(' | '));
  check('media steps at 1638 / 1384 / 1316 / 1263 / 1195', TH.every(x => media.includes(`(max-width: ${x}px)`)), media);

  check('no page errors', !errors.length, errors.join(' | '));
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```


- [ ] **Step 2: Run it to see it fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node save-menu-test.js`
Expected: FAIL from "no PDF: … disabled" on (`#bSaveMore` doesn't exist; later steps time out). Stop it with Ctrl+C
if it waits long; the point is that it fails.

- [ ] **Step 3: The menubar HTML** — in `app/index.html` replace

```html
    <button class="btn" id="bSave" title="Save PDF (Ctrl+S)"><svg class="i" data-i="save"></svg><span class="lbl">Save</span></button>
```
with
```html
    <span class="splitbtn"><button class="btn" id="bSave" title="Save PDF (Ctrl+S)"><svg class="i" data-i="save"></svg><span class="lbl">Save</span></button><button class="btn icon more" id="bSaveMore" title="More ways to save" aria-label="More ways to save" aria-haspopup="menu" aria-expanded="false"><svg class="i" data-i="up"></svg></button></span>
```

- [ ] **Step 4: The CSS** — in `app/index.html`, right after the line
`.btn.outline{border:1px solid var(--line-strong)}` add:

```css
/* Save ▾, as Acrobat's: Save and a narrow arrow that opens Save / Save As… / Save as Reduced Size PDF… — one unit */
.splitbtn{display:inline-flex;align-items:center;flex:none;border-radius:6px}
.splitbtn>.btn{border-radius:0}
.splitbtn>#bSave{border-radius:6px 0 0 6px}
.splitbtn>.more{width:20px;border-radius:0 6px 6px 0;position:relative}
.splitbtn>.more::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:1px;background:var(--line-strong);opacity:0}
.splitbtn:hover>.more::before,.splitbtn>.more[aria-expanded="true"]::before{opacity:1}
.splitbtn:hover>.btn:not(:disabled),.splitbtn>.more[aria-expanded="true"]{background:var(--hover)}
.splitbtn>.more svg{width:12px;height:12px;transform:rotate(180deg)}
```
and move each width step up by the arrow's 20 px — replace
```css
@media (max-width:1618px){#app:not(.focus) .menubar .btn .lbl{display:none}}
@media (max-width:1364px){#bFitW,#bFitP{display:none}}
@media (max-width:1296px){.menubar .brand-km{display:none}}
@media (max-width:1243px){#bZoomOut,#bZoomIn{display:none}}
@media (max-width:1175px){#bPrev,#bNext{display:none}}
```
with
```css
@media (max-width:1638px){#app:not(.focus) .menubar .btn .lbl{display:none}}
@media (max-width:1384px){#bFitW,#bFitP{display:none}}
@media (max-width:1316px){.menubar .brand-km{display:none}}
@media (max-width:1263px){#bZoomOut,#bZoomIn{display:none}}
@media (max-width:1195px){#bPrev,#bNext{display:none}}
```

- [ ] **Step 5: `saveReducedActive`** — in `app/index.html`, right after the closing `}` of `async function saveAsActive(){ … }` add:

```js
// Save as Reduced Size PDF… (Save ▾, ☰ File): a smaller copy of the open file as it is now, as Acrobat's — pictures to
// 150 ppi JPEG, the file packed (reduce.js). The Save window starts in the open file's own folder (the user's wish) with
// "<name>_reduced.pdf"; the tab stays the original file.
async function saveReducedActive(){
  const d = active(); if (!d) return;
  const step = ({ i, n }) => { $('#stBusy').innerHTML = `<span class="busy"><span class="spin"></span>Reducing file size · picture ${i} of ${n}…</span>`; };
  const r = await busy('Reducing file size…', async () => {
    try { return await SastraReduce.reduce(d.bytes, { onStep:step }); } catch(e){ return { error:e.reason || 'damaged' }; }
  });
  if (!r) return;   // another task was running
  if (r.error) { toast(`Couldn't reduce ${d.name}: ${r.error === 'protected' ? "it's password-protected" : 'it may be damaged'}`, true); return; }
  if (!r.bytes) { toast(`${d.name} is already as small as it can be — no copy made`); return; }
  const name = SastraReduce.reducedName(d.name);
  const how = `${fmtBytes(r.before)} → ${fmtBytes(r.after)} (${Math.round((1 - r.after / r.before) * 100)} % smaller)`;
  if (desk) {
    const dir = d.path && !d.sample ? d.path.replace(/[\\/][^\\/]*$/, '') : d.saveDir || null;
    try { const p = await desk.saveDialog(name, r.bytes.slice().buffer, 'reduced', dir); if (p) toast(`Saved ${p.split(/[\\/]/).pop()} · ${how}`); }
    catch(e){ toast(`Couldn't save ${name}: ${e.message}`, true); }
    return;
  }
  if (await saveFile(name, new Blob([r.bytes], { type:'application/pdf' }))) toast(`Saved ${name} · ${how}`);
}
```

- [ ] **Step 6: Enable/disable with Save, and the ☰ command** — in `updateUI` replace
```js
  ['#bSave','#bPrint','#bZoomOut',
```
with
```js
  ['#bSave','#bSaveMore','#bPrint','#bZoomOut',
```
(the rest of that line stays). In the `desk.onMenu` map replace
```js
      open:openCmd, save:saveActive, saveAs:saveAsActive, closeTab:() => d && closeDoc(d.id), undo, redo,
```
with
```js
      open:openCmd, save:saveActive, saveAs:saveAsActive, saveReduced:saveReducedActive, closeTab:() => d && closeDoc(d.id), undo, redo,
```

- [ ] **Step 7: The list itself** — in `app/index.html`, in the right-click menu code:

Replace
```js
function closeMenu(refocus){ if (!cmenu) return; cmenu.remove(); cmenu = null; if (refocus) viewer.focus({ preventScroll:true }); }
```
with
```js
function closeMenu(refocus){
  if (!cmenu) return;
  const save = cmenu.classList.contains('savemenu'); cmenu.remove(); cmenu = null;
  if (save) $('#bSaveMore').setAttribute('aria-expanded', 'false');
  if (refocus) (save ? $('#bSaveMore') : viewer).focus({ preventScroll:true });
}
// ↑ ↓ Tab move through a menu's items, Esc closes it; page shortcuts (Esc = restore, Delete, F…) stay out of an open menu
const menuKeys = m => e => {
  e.stopPropagation();
  if (e.target.closest('select')?.matches(':open')) return;   // the menu's open zoom list handles its own keys
  const items = [...m.querySelectorAll('.ci:not(:disabled), select:not(:disabled), input:not(:disabled)')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
    e.preventDefault(); const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
    items[i < 0 ? (back ? items.length-1 : 0) : (i + (back ? -1 : 1) + items.length) % items.length]?.focus();
  }
};
```
In `openMenu`, replace
```js
  m.addEventListener('keydown', e => {
    e.stopPropagation();   // page shortcuts (Esc = restore, Delete, F…) stay out of the open menu
    if (e.target.closest('select')?.matches(':open')) return;   // the menu's open zoom list handles its own keys
    const items = [...m.querySelectorAll('.ci:not(:disabled), select:not(:disabled), input:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') {
      e.preventDefault(); const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      items[i < 0 ? (back ? items.length-1 : 0) : (i + (back ? -1 : 1) + items.length) % items.length]?.focus();
    }
  });
```
with
```js
  m.addEventListener('keydown', menuKeys(m));
```
Replace
```js
document.addEventListener('pointerdown', e => { if (cmenu && !cmenu.contains(e.target)) closeMenu(); }, true);
```
with
```js
// a click outside closes a menu (the Save arrow's own click toggles its list)
document.addEventListener('pointerdown', e => {
  if (cmenu && !cmenu.contains(e.target) && !(cmenu.classList.contains('savemenu') && e.target.closest?.('#bSaveMore'))) closeMenu();
}, true);

/* ---------- Save ▾: the arrow next to Save lists Save / Save As… / Save as Reduced Size PDF… (as Acrobat's) ---------- */
const SAVE_MENU = [['Save', 'Ctrl+S', () => saveActive()], ['Save As…', 'Ctrl+Shift+S', () => saveAsActive()], ['Save as Reduced Size PDF…', '', () => saveReducedActive()]];
function openSaveMenu(byKey){
  closeMenu();
  const b = $('#bSaveMore'), r = b.parentElement.getBoundingClientRect();
  const m = document.createElement('div'); m.className = 'cmenu savemenu'; m.setAttribute('role','menu'); m.tabIndex = -1;
  for (const [label, keys, run] of SAVE_MENU) {
    const it = document.createElement('button'); it.type = 'button'; it.className = 'ci'; it.setAttribute('role','menuitem');
    it.innerHTML = `<span></span><span></span><span class="kb">${keys}</span>`; it.children[1].textContent = label;
    it.onclick = () => { closeMenu(); run(); };
    m.appendChild(it);
  }
  m.addEventListener('keydown', menuKeys(m));
  document.body.appendChild(m); cmenu = m; b.setAttribute('aria-expanded', 'true');
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.getBoundingClientRect().width - 8)) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
  (byKey ? m.querySelector('.ci') : m).focus({ preventScroll:true });
}
$('#bSaveMore').onclick = e => { if (cmenu?.classList.contains('savemenu')) closeMenu(); else openSaveMenu(!e.detail); };   // detail 0 = Enter/Space
$('#bSaveMore').onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); openSaveMenu(true); } };
```

- [ ] **Step 8: main.js** — in `buildMenu` replace
```js
      k('Save &As…', 'Ctrl+Shift+S', 'saveAs'),
```
with
```js
      k('Save &As…', 'Ctrl+Shift+S', 'saveAs'),
      k('Save as &Reduced Size PDF…', undefined, 'saveReduced'),
```
and in the `save-dialog` handler replace
```js
    title: kind === 'export' ? 'Export' : kind === 'pdf' ? 'Save as PDF' : 'Save As',
```
with
```js
    title: kind === 'export' ? 'Export' : kind === 'pdf' ? 'Save as PDF' : kind === 'reduced' ? 'Save as Reduced Size PDF' : 'Save As',
```

- [ ] **Step 9: Run the test to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node save-menu-test.js`
Expected: `ALL PASS`. If a "logo row fits" line fails, the arrow is wider than 20 px — fix the CSS, not the thresholds.

- [ ] **Step 10: Update `CLAUDE.md`** — in the "Layout" bullet replace
"button labels (<1619px), Fit width/page (<1365), the Khmer name (<1297), Zoom −/+ (<1244),
  Prev/Next (<1176)" with "button labels (<1639px), Fit width/page (<1385), the Khmer name (<1317), Zoom −/+ (<1264),
  Prev/Next (<1196)", and at the end of that bullet add " 2026-10-20: the Save ▾ arrow (20 px) moved every threshold up 20
  (save-menu-test.js measures the row at each step)." After the "Save icon" bullet add:

```
- Save ▾ (since 2026-10-20, as Acrobat's split Save): `.splitbtn` = `#bSave` + a 20 px arrow `#bSaveMore` (`up` icon
  turned) that opens `.cmenu.savemenu` (`openSaveMenu`, same look and keys as the right-click menu — `menuKeys`):
  Save (Ctrl+S) / Save As… (Ctrl+Shift+S) / Save as Reduced Size PDF… (`saveReducedActive`, also ☰ File, command
  `saveReduced`). The reduced copy: `SastraReduce.reduce(d.bytes)` under `busy` ("Reducing file size · picture 3 of
  40…"), then main's Save dialog (kind `'reduced'`, title "Save as Reduced Size PDF") starting in the OPEN FILE'S folder
  (the user's wish; `d.saveDir` for a file with no path), name `<name>_reduced.pdf`; toast "Saved … · 12.4 MB → 3.1 MB
  (75 % smaller)"; the tab stays the original. Not smaller → "<name> is already as small as it can be — no copy made".
```

- [ ] **Step 11: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html main.js CLAUDE.md && git commit -m "feat: Save ▾ — Save, Save As…, Save as Reduced Size PDF… (in the open file's folder); ☰ File item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: File Explorer menu entry "Reduce file size" (DLL)

**Files:**
- Modify: `explorer-menu/menu.cpp` (line 1 comment, `enum class Act` line 29, `Title`, `TaskName`, `Item::Separator`,
  `Item::Invoke` comment, `Enum` list)
- Modify: `explorer-menu.js` line 13 (`TASKS`)
- Modify: `scripts/menu-sources.js` (`menuProblems` checks every task name), `scripts/build-explorer-menu.js` (passes `TASKS`)
- Modify (tests): `T\harness\menu-harness.cpp`; Create: `T\menu-sources.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1–3.
- Produces: a menu click runs `Sastra PDF.exe --sastra-task=reduce --sastra-list=<file>` with the selection's PDFs;
  `TASKS` includes `'reduce'` (so `parseTaskArgs` accepts it and main.js sends it to the task window — Task 5).

- [ ] **Step 1: Write the failing source check** — create `T\menu-sources.test.js`:

```js
// scripts/menu-sources.js: every Explorer-menu task in explorer-menu.js must exist in menu.cpp (2026-10-20: "reduce").
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = 'E:/_httdocs/SastraPDF';
const { menuProblems } = require(path.join(ROOT, 'scripts/menu-sources.js'));
const { CLSID, PKG, PKG_VERSION, EXTS, TASKS } = require(path.join(ROOT, 'explorer-menu.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const real = { cpp: read('explorer-menu', 'menu.cpp'), sparse: read('explorer-menu', 'AppxManifest.xml'), store: read('build', 'store-manifest.xml'), CLSID, PKG, PKG_VERSION, EXTS, TASKS };
test('the real sources agree, reduce included', () => {
  assert.ok(TASKS.includes('reduce'));
  assert.deepStrictEqual(menuProblems(real), []);
});
test('a task missing from menu.cpp is a problem', () => {
  const p = menuProblems({ ...real, cpp: real.cpp.replace('L"reduce"', 'L"nothing"') });
  assert.ok(p.some(x => /reduce/.test(x)), p.join(' | '));
});
```

Run: `cd "$T" && node --test menu-sources.test.js`
Expected: FAIL ("TASKS.includes('reduce')" is false).

- [ ] **Step 2: menu.cpp** — make these replacements in `explorer-menu/menu.cpp`:

Line 1:
```cpp
// Sastra PDF — File Explorer right-click menu: "Sastra PDF ▸ Make PDF / Combine / Split / Images" for PDFs and pictures.
```
→
```cpp
// Sastra PDF — File Explorer right-click menu: "Sastra PDF ▸ Make PDF / Combine / Split / Images / Reduce file size" for PDFs and pictures.
```
```cpp
enum class Act { MakePdf, Combine, Sep1, SplitHere, SplitFolder, Sep2, ImagesHere, ImagesFolder };
```
→
```cpp
enum class Act { MakePdf, Combine, Sep1, SplitHere, SplitFolder, Sep2, ImagesHere, ImagesFolder, Sep3, Reduce };
```
In `Title`, after the `case Act::ImagesFolder: …` line add:
```cpp
    case Act::Reduce: return L"Reduce file size";
```
In `TaskName`, after `case Act::ImagesFolder: return L"images-folder";` add:
```cpp
    case Act::Reduce: return L"reduce";
```
Change the comment above `Shown` from
```cpp
// Make PDF: exactly one picture. Combine: 2+ files of any kind. Split / Images (and the lines around them): the PDFs only.
```
to
```cpp
// Make PDF: exactly one picture. Combine: 2+ files of any kind. Split / Images / Reduce (and the lines around them): the PDFs only.
```
In `class Item`:
```cpp
  bool Separator() const { return act_ == Act::Sep1 || act_ == Act::Sep2; }
```
→
```cpp
  bool Separator() const { return act_ == Act::Sep1 || act_ == Act::Sep2 || act_ == Act::Sep3; }
```
```cpp
    return Launch(act_, act_ == Act::MakePdf || act_ == Act::Combine ? s.all : s.pdfs);   // Split / Images: the PDFs only
```
→
```cpp
    return Launch(act_, act_ == Act::MakePdf || act_ == Act::Combine ? s.all : s.pdfs);   // Split / Images / Reduce: the PDFs only
```
In `class Enum`:
```cpp
    for (Act a : { Act::MakePdf, Act::Combine, Act::Sep1, Act::SplitHere, Act::SplitFolder, Act::Sep2, Act::ImagesHere, Act::ImagesFolder })
```
→
```cpp
    for (Act a : { Act::MakePdf, Act::Combine, Act::Sep1, Act::SplitHere, Act::SplitFolder, Act::Sep2, Act::ImagesHere, Act::ImagesFolder, Act::Sep3, Act::Reduce })
```

- [ ] **Step 3: explorer-menu.js and the source check**

`explorer-menu.js` line 13:
```js
const TASKS = ['combine', 'split-here', 'split-folder', 'images-here', 'images-folder'];
```
→
```js
const TASKS = ['combine', 'split-here', 'split-folder', 'images-here', 'images-folder', 'reduce'];
```
`scripts/menu-sources.js`: replace
```js
function menuProblems({ cpp, sparse, store, CLSID, PKG, PKG_VERSION, EXTS }) {
  const id = CLSID.slice(1, -1).toLowerCase(), xmls = { sparse, store }, problems = [];
  if (!cpp.toLowerCase().includes(`uuid("${id}")`)) problems.push(`menu.cpp does not use ${CLSID}`);
  for (const e of EXTS) if (!cpp.includes(`L"${e}"`)) problems.push(`menu.cpp does not handle ${e}`);
```
with
```js
function menuProblems({ cpp, sparse, store, CLSID, PKG, PKG_VERSION, EXTS, TASKS = [] }) {
  const id = CLSID.slice(1, -1).toLowerCase(), xmls = { sparse, store }, problems = [];
  if (!cpp.toLowerCase().includes(`uuid("${id}")`)) problems.push(`menu.cpp does not use ${CLSID}`);
  for (const e of EXTS) if (!cpp.includes(`L"${e}"`)) problems.push(`menu.cpp does not handle ${e}`);
  for (const t of TASKS) if (!cpp.includes(`L"${t}"`)) problems.push(`menu.cpp has no "${t}" task (explorer-menu.js TASKS)`);
```
and update the comment at the top of that file from "the same CLSID, the same file types, each manifest's DLL path, the
sparse package's name and version." to "the same CLSID, the same file types, the same task names, each manifest's DLL
path, the sparse package's name and version.".
`scripts/build-explorer-menu.js`: replace
```js
const { CLSID, PKG, PKG_VERSION, EXTS } = require('../explorer-menu.js');
```
with
```js
const { CLSID, PKG, PKG_VERSION, EXTS, TASKS } = require('../explorer-menu.js');
```
and in the `menuProblems({ … })` call replace `CLSID, PKG, PKG_VERSION, EXTS });` with `CLSID, PKG, PKG_VERSION, EXTS, TASKS });`.

Run: `cd "$T" && node --test menu-sources.test.js`
Expected: 2 tests pass.

- [ ] **Step 4: Build the DLL**

Run: `cd /e/_httdocs/SastraPDF && pnpm run build:menu`
Expected: compiles `explorer-menu\out\SastraMenu.dll` and packs the .msix with no error ("'vswhere.exe' is not
recognized" from vcvars is harmless).

- [ ] **Step 5: Update the DLL harness** — in `T\harness\menu-harness.cpp`:

Replace the sub-commands comment and the first checks
```cpp
  // sub-commands: 0 Make PDF, 1 Combine, 2 —, 3 Split here, 4 Split to…, 5 —, 6 Images here, 7 Images to…
  auto rows1 = Rows(root.Get(), one.Get());
  check(L"8 sub-commands", rows1.size() == 8, std::to_wstring(rows1.size()));
  const std::wstring onePdf = L"Split here|Split to \"Report\\\"|—|Images here (JPG)|Images to \"Report\\\" (JPG)";
```
with
```cpp
  // sub-commands: 0 Make PDF, 1 Combine, 2 —, 3 Split here, 4 Split to…, 5 —, 6 Images here, 7 Images to…, 8 —, 9 Reduce file size
  auto rows1 = Rows(root.Get(), one.Get());
  check(L"10 sub-commands", rows1.size() == 10, std::to_wstring(rows1.size()));
  const std::wstring onePdf = L"Split here|Split to \"Report\\\"|—|Images here (JPG)|Images to \"Report\\\" (JPG)|—|Reduce file size";
```
Replace
```cpp
  check(L"three PDFs", Visible(rows3) == L"Combine 3 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)", Visible(rows3));
```
with
```cpp
  check(L"three PDFs", Visible(rows3) == L"Combine 3 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)|—|Reduce file size", Visible(rows3));
```
Replace
```cpp
  check(L"long Khmer name cut to 32 + …", rowsK.size() == 8 && rowsK[4].title == L"Split to \"" + kname.substr(0, 32) + L"…\\\"", rowsK.size() == 8 ? rowsK[4].title : L"");
```
with
```cpp
  check(L"long Khmer name cut to 32 + …", rowsK.size() == 10 && rowsK[4].title == L"Split to \"" + kname.substr(0, 32) + L"…\\\"", rowsK.size() == 10 ? rowsK[4].title : L"");
```
Replace
```cpp
  check(L"2 pictures + 2 PDFs + text: Combine 4 files, Split to folders", Visible(Rows(root.Get(), many.Get())) == L"Combine 4 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)", Visible(Rows(root.Get(), many.Get())));
```
with
```cpp
  check(L"2 pictures + 2 PDFs + text: Combine 4 files, Split to folders", Visible(Rows(root.Get(), many.Get())) == L"Combine 4 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)|—|Reduce file size", Visible(Rows(root.Get(), many.Get())));
```
Before the line `  wprintf(fails ? L"\n%d FAILED\n" : L"\nALL PASS\n", fails);` add:
```cpp
  cl = InvokeAndRead(At(rowsM, 9), picPdf.Get(), out);
  list = ListOf(cl);
  check(L"Reduce file size on picture + PDF → --sastra-task=reduce, only the PDF", cl.find(L"--sastra-task=reduce") != std::wstring::npos && FromUtf8(ReadAll(list)) == dir + L"\\Report.pdf\n", FromUtf8(ReadAll(list)));
  DeleteFileW(list.c_str());
```
(The picture-only checks — one picture "only Make PDF", two pictures "only Combine 2 files", picture + text — stay: no
PDF, so no Reduce entry.)

- [ ] **Step 6: Build and run the harness**

```bash
cd "$T/harness" && cmd //c build.bat && ./menu-harness.exe "E:\\_httdocs\\SastraPDF\\explorer-menu\\out\\SastraMenu.dll" "$(cygpath -w "$T/harness/files")" "$(cygpath -w "$T/harness/stub.exe")"
```
Expected: `HARNESS-BUILT`, then every line PASS and `ALL PASS` (the 39 checks of 2026-10-17 plus the new one).

- [ ] **Step 7: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add explorer-menu/menu.cpp explorer-menu.js scripts/menu-sources.js scripts/build-explorer-menu.js && git commit -m "feat: File Explorer menu — Reduce file size (task 'reduce', PDFs only; DLL only, no manifest change)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The task window runs `reduce`

**Files:**
- Modify: `app/task.js` (header comment, the constants line, `finish`, `batch`, a new `reduceBatch`)
- Modify: `app/pdfops.js` (add `fmtBytes` to `SastraOps`), `app/index.html` (`fmtBytes` from `SastraOps`)
- Create (tests): `T\reduce-menu-test.js`

**Interfaces:**
- Consumes: `SastraReduce.reduce` / `reducedName` (Tasks 1–2), the `reduce` task from Task 4, `desk.nameClashes`,
  `desk.resolveNames`, `desk.writeFile`, `desk.readFile` (existing).
- Produces: `SastraOps.fmtBytes(bytes: number) → string` ("12.4 MB", "980 KB", "512 B").

- [ ] **Step 1: Write the failing test** — create `T\reduce-menu-test.js`:

```js
// File Explorer › Sastra PDF › Reduce file size (spec 2026-10-20-reduce-size-design.md C), started as the menu starts
// it: a list file in %TEMP%\Sastra PDF + --sastra-task=reduce. PACKED=1 tests dist\win-unpacked.
const { _electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const { makeReduceFixtures } = require('./reduce-fixtures');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const OUT = path.join(T, 'out-reduce-menu'), UD = path.join(T, 'ud-reduce-menu'), LISTS = path.join(os.tmpdir(), 'Sastra PDF');
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const ls = d => fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
let listN = 0;
function listFile(paths) { fs.mkdirSync(LISTS, { recursive: true }); const f = path.join(LISTS, `menu-test-${process.pid}-${++listN}.txt`); fs.writeFileSync(f, paths.join('\n') + '\n'); return f; }
async function click(paths) {   // the menu click with the app not running → the task window
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, '--sastra-task=reduce', '--sastra-list=' + listFile(paths)], env });
  const w = await app.firstWindow(); let gone = false; app.process().on('exit', () => { gone = true; });
  return { w, exited: () => gone };
}
const state = w => w.evaluate(() => ({ what: document.querySelector('#what').textContent, step: document.querySelector('#step').textContent,
  done: +(document.body.dataset.done || 0), asking: !document.querySelector('#ask').hidden, problems: [...document.querySelectorAll('#problems li')].map(l => l.textContent) }));

(async () => {
  for (const d of [OUT, UD]) fs.rmSync(d, { recursive: true, force: true });
  { const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD], env });
    const p = await app.firstWindow(); await p.waitForLoadState('load'); await require('./notes-skip')(p);
    await makeReduceFixtures(p, path.join(OUT, 'fx')); await app.close(); }
  const put = (dir, name, from) => { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(OUT, 'fx', from + '.pdf'), path.join(dir, name)); return path.join(dir, name); };

  // 1) two PDFs (one Khmer name) → two _reduced copies next to them; the sizes in the done line; the app quits
  const A = path.join(OUT, 'a'), p1 = put(A, 'scan.pdf', 'scan'), p2 = put(A, 'ឯកសារ ស្កេន.pdf', 'exif');
  let { w, exited } = await click([p1, p2]);
  check('the window is the task window', w.url().endsWith('/task.html'), w.url());
  await until(async () => (await state(w)).done > 0, 120000);
  let s = await state(w);
  check('done line: "2 files saved · before → after"', s.what === 'Done' && /^2 files saved · [\d.]+ MB → [\d.]+ (MB|KB)$/.test(s.step), s);
  await until(exited, 15000);
  check('scan_reduced.pdf and the Khmer _reduced copy next to the originals', ls(A).join('|') === ['scan.pdf', 'scan_reduced.pdf', 'ឯកសារ ស្កេន.pdf', 'ឯកសារ ស្កេន_reduced.pdf'].sort().join('|'), ls(A).join('|'));
  check('the copy is smaller', fs.existsSync(path.join(A, 'scan_reduced.pdf')) && fs.statSync(path.join(A, 'scan_reduced.pdf')).size < fs.statSync(p1).size * 0.6);
  check('the window closed by itself and the app quit', exited());

  // 2) the name is already there → the question inside the window → Keep both
  const B = path.join(OUT, 'b'), p3 = put(B, 'scan.pdf', 'scan'); fs.writeFileSync(path.join(B, 'scan_reduced.pdf'), 'old');
  ({ w, exited } = await click([p3]));
  check('scan_reduced.pdf already there → the question in the window', await until(async () => (await state(w)).asking, 30000));
  await w.click('#bKeep');
  await until(async () => (await state(w)).done > 0, 120000); await until(exited, 15000);
  check('Keep both → scan_reduced (2).pdf; the old one untouched', ls(B).includes('scan_reduced (2).pdf') && fs.readFileSync(path.join(B, 'scan_reduced.pdf'), 'utf8') === 'old', ls(B).join('|'));

  // 3) can't get smaller / password-protected → listed; no copies; the window stays open
  const C = path.join(OUT, 'c'), p4 = put(C, 'text.pdf', 'text'), p5 = put(C, 'locked.pdf', 'locked');
  ({ w, exited } = await click([p4, p5]));
  await until(async () => (await state(w)).done > 0, 60000); s = await state(w);
  check('text-only: "text.pdf is already as small as it can be — no copy made"', s.problems.includes('text.pdf is already as small as it can be — no copy made'), s.problems);
  check("protected: \"locked.pdf: it's password-protected\"", s.problems.includes("locked.pdf: it's password-protected"), s.problems);
  check('no copies made', ls(C).join('|') === 'locked.pdf|text.pdf', ls(C).join('|'));
  await sleep(2600); check('the window stays open (something to read)', !exited());
  await w.click('#bClose'); await until(exited, 15000);

  // 4) Cancel stops the run
  const D = path.join(OUT, 'd'), many = [1, 2, 3].map(k => put(D, `scan${k}.pdf`, 'scan'));
  ({ w, exited } = await click(many));
  await until(async () => (await state(w)).what.startsWith('Reducing'), 30000);
  await w.click('#bCancel');
  await until(async () => (await state(w)).done > 0, 60000); s = await state(w);
  check('Cancel: "Cancelled", not all three made', s.what === 'Cancelled' && ls(D).filter(f => f.includes('_reduced')).length < 3, { s, files: ls(D) });
  await w.click('#bClose'); await until(exited, 15000);
  check('list files deleted', !ls(LISTS).some(f => f.startsWith('menu-test-')));

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-menu-test.js`
Expected: FAIL — the task window treats `reduce` as an "Images" job (or does nothing); no `_reduced` files.
(Ctrl+C if a wait hangs.)

- [ ] **Step 3: `SastraOps.fmtBytes`** — in `app/pdfops.js` replace
```js
  window.SastraOps = { PDFJS_OPTS, pdfjs, closePdf, baseName, rangeLabel, imageName, renderPage };
```
with
```js
  // 512 B, 980 KB, 12.4 MB
  const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  window.SastraOps = { PDFJS_OPTS, pdfjs, closePdf, baseName, rangeLabel, imageName, renderPage, fmtBytes };
```
In `app/index.html` replace
```js
const fmtBytes = b => b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(0)+' KB' : (b/1048576).toFixed(1)+' MB';
```
with
```js
const fmtBytes = SastraOps.fmtBytes;
```

- [ ] **Step 4: task.js** — make these replacements in `app/task.js`:

Header lines 1–3:
```js
// Sastra PDF — the small window for File Explorer menu jobs (Split / Images). main.js sends one batch per menu
// click ({ task, paths }); batches run one after another. Per click: open the PDFs (page counts decide the names),
// ask ONE Replace / Keep both / Cancel question, then write each file as soon as it is made.
```
→
```js
// Sastra PDF — the small window for File Explorer menu jobs (Split / Images / Reduce file size). main.js sends one batch
// per menu click ({ task, paths }); batches run one after another. Per click: open the PDFs (page counts decide the
// names), ask ONE Replace / Keep both / Cancel question, then write each file as soon as it is made.
```
```js
  const desk = window.sastra, Ops = window.SastraOps, { PDFDocument } = window.PDFLib;
```
→
```js
  const desk = window.sastra, Ops = window.SastraOps, Reduce = window.SastraReduce, { PDFDocument } = window.PDFLib;
```
```js
  let running = false, cancelled = false, saved = 0, problemCount = 0, closeTimer = null;
```
→
```js
  let running = false, cancelled = false, saved = 0, problemCount = 0, closeTimer = null, sizeBefore = 0, sizeAfter = 0;
```
In `finish()` replace
```js
    else { show('Done', `${files} saved`, 1); closeTimer = setTimeout(() => window.close(), 2000); }
```
with
```js
    else {   // Reduce file size adds the sizes: "2 files saved · 18.6 MB → 4.9 MB"
      show('Done', `${files} saved${sizeAfter ? ` · ${Ops.fmtBytes(sizeBefore)} → ${Ops.fmtBytes(sizeAfter)}` : ''}`, 1);
      closeTimer = setTimeout(() => window.close(), 2000);
    }
```
At the start of `async function batch({ task, paths }) {` add the first line:
```js
    if (task === 'reduce') return reduceBatch(paths);
```
After the closing `}` of `async function batch(…)`, add:
```js
  // Reduce file size: "<name>_reduced.pdf" next to each PDF (reduce.js, as the main window's Save as Reduced Size PDF).
  // The "already there" question first, from the names alone; then each file is reduced and written at once.
  async function reduceBatch(paths) {
    const jobs = paths.map(p => ({ path: p, name: fileOf(p), dir: dirOf(p) }));
    const groups = jobs.map(j => ({ dir: j.dir, names: [Reduce.reducedName(j.name)] })), q = await desk.nameClashes(groups);
    let choice = null;
    if (q.count) {
      show('Some files are already there', '', 0);
      choice = await ask(q.message, q.detail);
      if (!choice) { problem(`Cancelled: nothing saved for ${jobs.length === 1 ? jobs[0].name : plural(jobs.length, 'PDF')}`); return; }
    }
    const final = await desk.resolveNames(groups, choice);
    for (const [k, j] of jobs.entries()) {
      if (cancelled) return;
      show(`Reducing ${j.name}`, jobs.length > 1 ? `File ${k + 1} of ${jobs.length}` : '', 0);
      const bytes = await readBytes(j.path, j.name); if (!bytes) continue;
      let r;
      try { r = await Reduce.reduce(bytes, { isCancelled: () => cancelled, onStep: ({ i, n }) => show(`Reducing ${j.name}`, `Picture ${i} of ${n}`, (i - 1) / n) }); }
      catch (e) {
        if (e?.reason === 'cancelled') return;
        problem(e?.reason === 'protected' ? `${j.name}: it's password-protected` : `${j.name}: it may be damaged or not a PDF`); continue;
      }
      if (!r.bytes) { problem(`${j.name} is already as small as it can be — no copy made`); continue; }
      try { await desk.writeFile(join(j.dir, final[k][0]), r.bytes); saved++; sizeBefore += r.before; sizeAfter += r.after; }
      catch (e) { problem(`${j.name}: ${why(e)}`); }
    }
  }
```

- [ ] **Step 5: Run the test to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-menu-test.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/task.js app/pdfops.js app/index.html && git commit -m "feat: Explorer menu Reduce file size — the task window writes <name>_reduced.pdf next to each PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Everything else still works; docs

**Files:**
- Modify: `CLAUDE.md` (Project layout, Explorer menu bullet, Status)
- Modify: `docs/superpowers/specs/2026-10-20-reduce-size-design.md` (Status line)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: nothing new.

- [ ] **Step 1: Run the older suites that touch Save, the menubar, the task window and dialogs**

```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && mkdir -p out && cp pdfs/ten.pdf out/ten.pdf
node menu-test.js; node nozip-test.js; node folders-test.js; node close-test.js; node controls-test.js; node titlebar-test.js; node images-test.js
```
Expected: menu 51, nozip 23, folders 7, close 12, controls 15, titlebar 43, images 61 — all PASS (counts as on
2026-10-17). A one-off failure while someone types into another window: re-run that suite.

- [ ] **Step 2: Run the whole new set once more, together**

```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && node reduce-test.js && node save-menu-test.js && node reduce-menu-test.js && node --test menu-sources.test.js
```
Expected: four `ALL PASS` / all tests pass.

- [ ] **Step 3: `CLAUDE.md`**

In "## Project layout", after the `app/images.js` entry add:
```
    app/reduce.js      `window.SastraReduce` (main window + task window): Reduce file size as Acrobat's — pictures over
                       225 ppi → 150 ppi, JPEG 0.75 when ≥ 10 % smaller (soft masks resized, kept Flate; CMYK/Indexed/
                       JPX/JBIG2/CCITT/1-bit and pictures under 20 KB untouched), plain streams → Flate, /Thumb,
                       /PieceInfo and unused objects dropped, object streams; no copy unless ≥ 1 % smaller.
                       `reduce(bytes, { onStep, isCancelled })` → { bytes|null, before, after } (throws .reason
                       protected/damaged/cancelled), `reducedName` → "<name>_reduced.pdf"
```
In the "Explorer menu" bullet replace
"Sastra PDF ▸ Make PDF (exactly 1 picture) / Combine N files (2+ files, any mix) / Split here / Split to
  "name\" / Images here (JPG) / Images to "name\" (JPG) (Split and Images only for the PDFs in the
  selection; they act on the PDFs only)."
with
"Sastra PDF ▸ Make PDF (exactly 1 picture) / Combine N files (2+ files, any mix) / Split here / Split to
  "name\" / Images here (JPG) / Images to "name\" (JPG) / Reduce file size (since 2026-10-20: `<name>_reduced.pdf` next
  to each PDF, task `reduce`, `reduceBatch` in task.js; DLL-only change, no manifest or package version change) (Split,
  Images and Reduce only for the PDFs in the selection; they act on the PDFs only)."
and in the same bullet replace `--sastra-task=<combine|split-here|split-folder|images-here|images-folder>` with
`--sastra-task=<combine|split-here|split-folder|images-here|images-folder|reduce>`.
At the end of "## Status (2026-10-15)" (before "- Next steps:") add:
```
- **Reduce file size (2026-10-20, on main, not released)**: Save ▾ (Save / Save As… / Save as Reduced Size PDF…) and
  File Explorer › Reduce file size (spec/plan 2026-10-20-reduce-size*). Passed from source: reduce-test (pack, pictures,
  the user's Khmer PDFs: text identical), save-menu-test, reduce-menu-test, menu-sources unit, DLL harness 40, and the
  older menu, nozip, folders, close, controls, titlebar, images suites (tests in this session's `t\`). The installed
  copy's right-click menu gets the entry only with a new release (new DLL); no UAC prompt (manifest unchanged).
  Needs a What's new entry in app/notes.js at release time.
```

- [ ] **Step 4: The spec's status** — in `docs/superpowers/specs/2026-10-20-reduce-size-design.md` replace
`Date: 2026-10-20 · Status: approved by the user ("Yes, go ahead").` with
`Date: 2026-10-20 · Status: approved by the user ("Yes, go ahead"); built 2026-10-20 (plan 2026-10-20-reduce-size.md).`

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add CLAUDE.md docs/superpowers/specs/2026-10-20-reduce-size-design.md && git commit -m "docs: Reduce file size — layout, Explorer menu, status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

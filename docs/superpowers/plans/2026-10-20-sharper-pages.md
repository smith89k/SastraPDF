# Sharper Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pages look as sharp as in Acrobat: ClearType text on screen, 600 dpi lossless sheets when printing.

Superseded during the work: print is 600 dpi JPEG 0.92 with a smart size check (500 MB budget) — see the spec, section B.

**Architecture:** The viewer's and Present's page canvases become opaque (`getContext('2d', { alpha:false })`) whenever
they are shown 1:1, which makes Chromium draw pdf.js's glyphs with LCD (ClearType) anti-aliasing; the devicePixelRatio
cap of 2 goes. Printing picks its resolution and image format with a new pure function `SastraPrint.printQuality`
(600 dpi PNG for normal jobs, stepping down for long ones). Spec: `docs/superpowers/specs/2026-10-20-sharper-pages-design.md`.

**Tech Stack:** Electron 44 (Chromium canvas), pdf.js 6.4.299, plain classic scripts (no build step), Playwright
(playwright-core 1.48.2) driving Electron for tests.

## Global Constraints

- Work on `main` only (the user's rule); commit after each task; never push or release without asking.
- No new libraries. No network use. Every UI string in plain English as the app writes it.
- Thumbnails, exported images and print keep grey anti-aliasing: ClearType only for canvases shown 1:1 on screen.
- The 4800 px canvas-side limit in the viewer and Present stays; past it the canvas is stretched and stays transparent (grey).
- Print: 600 dpi PNG up to 50 A4-sized sheets (A3 counts 2, A5 ½, Letter / Legal by area), 300 dpi PNG up to 150,
  more: 150 dpi JPEG 0.92; a sheet never passes 64 MP (A3 → 575 dpi). Save as PDF is NOT changed (300 / 150 dpi JPEG).
- Tests never print on paper (main's `print` handler is swapped for a recorder).
- Launching Electron from a Claude shell needs `unset ELECTRON_RUN_AS_NODE` first (else electron.exe acts as Node).
- Tests read the user's Khmer PDFs in place, read-only — never copy them anywhere.

## Paths used below

- `APP` = `E:\_httdocs\SastraPDF` (the repo).
- `T` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\c2983e9f-c627-43c6-9568-026975cadb1b\scratchpad\t`
  (this session's test folder; Git Bash: `/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/c2983e9f-c627-43c6-9568-026975cadb1b/scratchpad/t`).
- `OLD` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t`
  (the 2026-10-17 test folder with the older suites).
- `KH` = `E:\_httdocs\PAS Financial Report\Financial Statements 2022 EnY\1. EnY_PAS_Q1_Interim_Financial_Statetments_31_Mar_22_KH.pdf`
  (a Khmer Word PDF of the user's; read-only).

---

### Task 1: ClearType text on screen (viewer and Present), no dpr cap

**Files:**
- Modify: `app/index.html` (`drawPage`, around line 1142; `showCanvas`, around line 1870)
- Modify: `CLAUDE.md` (section "How app/index.html works")
- Create (tests, outside the repo): `T\package.json`, `T\notes-skip.js` (copied), `T\sharp-screen-test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: the test folder `T` with playwright-core and `notes-skip.js`, used by every later task and by the
  reduce-size plan.

- [ ] **Step 1: Set up the test folder**

```bash
T=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/c2983e9f-c627-43c6-9568-026975cadb1b/scratchpad/t
OLD=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t
mkdir -p "$T" && cd "$T" && npm init -y >/dev/null && npm i playwright-core@1.48.2 --no-audit --no-fund
cp "$OLD/notes-skip.js" "$T/"
for f in print-test.js print-screen-test.js controls-test.js titlebar-test.js close-test.js folders-test.js menu-test.js menu-test-combine.js nozip-test.js ops-test.js images-test.js pages-panel-test.js tools-fold-test.js pictures.js; do cp "$OLD/$f" "$T/" 2>/dev/null; done
cp -r "$OLD/pdfs" "$OLD/harness" "$T/"
ls "$T"
```
Expected: `node_modules`, `notes-skip.js`, the copied suites, `pdfs/` (has `ten.pdf`, `locked.pdf`), `harness/`.

- [ ] **Step 2: Write the failing test** — create `T\sharp-screen-test.js`:

```js
// Sharper pages on screen (docs/superpowers/specs/2026-10-20-sharper-pages-design.md A): page canvases shown 1:1 are
// opaque (ClearType text, as Acrobat); a canvas stretched past the 4800 px limit and the thumbnails stay grey;
// Present's canvas is opaque and 1:1; no devicePixelRatio cap of 2. Reads the user's Khmer report in place (read-only).
// PACKED=1 tests dist\win-unpacked. Close-ups for the user in shots-sharp\.
const { _electron } = require('playwright-core');
const { PDFDocument, StandardFonts } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const fs = require('fs'), path = require('path');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const KH = 'E:/_httdocs/PAS Financial Report/Financial Statements 2022 EnY/1. EnY_PAS_Q1_Interim_Financial_Statetments_31_Mar_22_KH.pdf';
const OUT = path.join(T, 'out-sharp'), SHOTS = path.join(T, 'shots-sharp');
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

async function textPage(file, w, h) {   // black text only (no colour), so any colour on screen is ClearType's
  const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), p = d.addPage([w, h]);
  for (let y = h - 60; y > 60; y -= 40) p.drawText('The quick brown fox jumps over the lazy dog 0123456789', { x: 40, y, size: 22, font: f });
  fs.writeFileSync(file, await d.save());
}
async function launch(files, extra = []) {
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, ...extra, '--user-data-dir=' + path.join(T, 'ud-sharp'), ...files], env });
  const page = await app.firstWindow(); await page.waitForLoadState('load');
  await require('./notes-skip')(page);   // fresh profile: What's new opens once
  await until(() => page.evaluate(() => document.querySelectorAll('#pages .page canvas').length > 0));
  return { app, page };
}
const zoom = (page, z) => page.evaluate(z => { const s = document.querySelector('#zoomSel'); s.value = z; s.dispatchEvent(new Event('change')); }, z);
const tab = (page, name) => page.evaluate(n => [...document.querySelectorAll('#tabstrip .tab')].find(t => t.textContent.includes(n))?.click(), name);
// the current page's canvas: opaque? shown 1:1 (canvas pixels = its CSS box × devicePixelRatio, ±1)?
const current = page => page.evaluate(() => {
  const c = document.querySelector('#pages .page.current canvas'); if (!c) return null;
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio;
  return { alpha: c.getContext('2d').getContextAttributes().alpha, w: c.width, css: +(r.width * dpr).toFixed(2), oneToOne: Math.abs(c.width - r.width * dpr) <= 1.01, dpr };
});
// a pixel-exact capture of the window; in the element's visible box, the share of ink pixels where red and blue
// differ by more than 40 (ClearType's colour fringes; grey anti-aliasing has none)
async function fringes(app, page, selector) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  return page.evaluate(async ({ b64, selector }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const shot = await createImageBitmap(new Blob([u], { type: 'image/png' })), r = document.querySelector(selector).getBoundingClientRect(), k = shot.width / innerWidth;
    const x0 = Math.max(0, Math.round(r.left * k)), y0 = Math.max(0, Math.round(r.top * k));
    const w = Math.min(Math.round(r.right * k), shot.width) - x0, h = Math.min(Math.round(r.bottom * k), shot.height) - y0;
    const c = new OffscreenCanvas(w, h).getContext('2d'); c.drawImage(shot, -x0, -y0);
    const d = c.getImageData(0, 0, w, h).data; let ink = 0, colour = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 600) { ink++; if (Math.abs(d[i] - d[i + 2]) > 40) colour++; }
    return { ink, colour, share: ink ? +(colour / ink).toFixed(3) : 0 };
  }, { b64: png, selector });
}
async function closeup(app, page, file) {   // 160 × 60 screen pixels of the current page, 5× bigger, for the user
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  const out = await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const shot = await createImageBitmap(new Blob([u], { type: 'image/png' })), r = document.querySelector('#pages .page.current').getBoundingClientRect(), k = shot.width / innerWidth;
    const o = new OffscreenCanvas(800, 300), x = o.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(shot, Math.round(r.left * k) + 150, Math.round(r.top * k) + 230, 160, 60, 0, 0, 800, 300);
    const a = new Uint8Array(await (await o.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s);
  }, png);
  fs.writeFileSync(path.join(SHOTS, file), Buffer.from(out, 'base64'));
}

(async () => {
  for (const d of [OUT, SHOTS]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  fs.rmSync(path.join(T, 'ud-sharp'), { recursive: true, force: true });
  const A4 = path.join(OUT, 'text-a4.pdf'), A3 = path.join(OUT, 'text-a3.pdf');
  await textPage(A4, 595.28, 841.89); await textPage(A3, 1190.55, 841.89);

  // 1) viewer: 1:1 and opaque at 100 %, fit width, 125 % (the Khmer report)
  let { app, page } = await launch([KH, A4, A3]);
  await tab(page, '_KH'); await sleep(500);
  for (const z of ['1', 'fit:width', '1.25']) {
    await zoom(page, z);
    await until(async () => (await current(page))?.oneToOne);
    const c = await current(page);
    check(`Khmer report at ${z}: canvas shown 1:1`, c?.oneToOne, c);
    check(`Khmer report at ${z}: canvas is opaque (ClearType)`, c?.alpha === false, c);
  }
  await zoom(page, '1'); await sleep(1200); await closeup(app, page, 'khmer-100.png');

  // 2) ClearType colour on black text at 100 %; none in the thumbnails; none past the 4800 px limit
  await tab(page, 'text-a4'); await zoom(page, '1'); await until(async () => (await current(page))?.oneToOne); await sleep(600);
  const f1 = await fringes(app, page, '#pages .page.current');
  check('black text at 100 %: ClearType colour fringes on screen (Windows ClearType on)', f1.share > 0.05, f1);
  const f2 = await fringes(app, page, '#thumbs .thumb .tbox');
  check('thumbnail: grey edges, no colour', f2.ink > 0 && f2.share < 0.02, f2);
  await tab(page, 'text-a3'); await zoom(page, '3');   // 1190.55 × 3 × dpr is past 4800 px
  await until(async () => { const c = await current(page); return c && c.w <= 4800 && c.css > 4801; });
  const c3 = await current(page);
  check('A3 at 300 %: canvas held to 4800 px, so it is stretched', c3 && c3.w <= 4800 && !c3.oneToOne, c3);
  check('A3 at 300 %: stretched canvas stays transparent (grey)', c3?.alpha === true, c3);
  await sleep(600);
  const f3 = await fringes(app, page, '#pages .page.current');
  check('A3 at 300 %: no colour fringes', f3.ink > 0 && f3.share < 0.02, f3);

  // 3) Present: opaque and 1:1
  await tab(page, '_KH'); await sleep(500);
  await page.keyboard.press('F5');
  await until(() => page.evaluate(() => !!document.querySelector('.show canvas')));
  const pc = await page.evaluate(() => { const c = document.querySelector('.show canvas'), r = c.getBoundingClientRect(); return { alpha: c.getContext('2d').getContextAttributes().alpha, w: c.width, css: +(r.width * devicePixelRatio).toFixed(2) }; });
  check('Present: canvas is opaque (ClearType)', pc.alpha === false, pc);
  check('Present: canvas shown 1:1', Math.abs(pc.w - pc.css) <= 1.01, pc);
  await page.keyboard.press('Escape'); await sleep(500);
  await app.close();

  // 4) a 250 % screen: the canvas follows devicePixelRatio (no cap of 2)
  ({ app, page } = await launch([A4], ['--force-device-scale-factor=2.5']));
  await zoom(page, '1'); await until(async () => (await current(page))?.oneToOne, 8000);
  const c4 = await current(page);
  check('250 % screen: devicePixelRatio is 2.5', c4?.dpr === 2.5, c4);
  check('250 % screen: canvas is 2.5 × its CSS size (shown 1:1)', c4?.oneToOne, c4);
  await app.close();

  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node sharp-screen-test.js`
Expected: FAIL on "canvas is opaque" (alpha true), "ClearType colour fringes", "Present: canvas is opaque",
"Present: canvas shown 1:1" (may pass by luck), and "250 % screen: … shown 1:1" (capped at 2).

- [ ] **Step 4: Change `drawPage` in `app/index.html`** — replace

```js
    const dpr = Math.min(window.devicePixelRatio||1, 2), s = d.sizes[i];
    let scale = d.zoom * dpr; const MAX = 4800;
    scale = Math.min(scale, MAX / s.w, MAX / s.h);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
```
with
```js
    const dpr = window.devicePixelRatio||1, s = d.sizes[i], MAX = 4800, want = d.zoom * dpr;
    const scale = Math.min(want, MAX / s.w, MAX / s.h);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    // Shown 1:1, the canvas is opaque, so Chromium draws the text with ClearType as Acrobat does. A canvas held to the
    // 4800 px limit is stretched: it stays transparent (grey edges), since stretched colour fringes look worse.
    const ctx = c.getContext('2d', scale < want ? undefined : { alpha:false }); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
```

- [ ] **Step 5: Change `showCanvas` (Present) in `app/index.html`** — replace

```js
      const fit = Math.min(el.clientWidth / s.w, el.clientHeight / s.h), dpr = Math.min(devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: Math.min(fit * dpr, 4800 / s.w, 4800 / s.h) });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      c.style.width = Math.floor(s.w * fit) + 'px'; c.style.height = Math.floor(s.h * fit) + 'px';
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
```
with
```js
      const fit = Math.min(el.clientWidth / s.w, el.clientHeight / s.h), dpr = devicePixelRatio || 1, want = fit * dpr;
      const vp = page.getViewport({ scale: Math.min(want, 4800 / s.w, 4800 / s.h) }), oneToOne = vp.scale >= want;
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      // as in the viewer: 1:1 with the screen (CSS size = canvas pixels / dpr) and opaque, so the text gets ClearType
      c.style.width = (oneToOne ? c.width / dpr : Math.floor(s.w * fit)) + 'px';
      c.style.height = (oneToOne ? c.height / dpr : Math.floor(s.h * fit)) + 'px';
      const ctx = c.getContext('2d', oneToOne ? { alpha:false } : undefined); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node sharp-screen-test.js`
Expected: every line PASS, then `ALL PASS`. Open `T\shots-sharp\khmer-100.png`: the Khmer letters show ClearType's
orange/blue edges. If only the fringe check fails, check Windows Settings › ClearType Text is on (the app follows it).

- [ ] **Step 7: Update `CLAUDE.md`** — in "How app/index.html works", after the bullet starting
"- Viewer: pages are placeholders sized from page dimensions;", add:

```
- Sharp text (since 2026-10-20, the user: "acrobat look sharper"; spec 2026-10-20-sharper-pages-design.md): a page
  canvas shown 1:1 (viewer, maximized slideshow, Present) is opaque — `getContext('2d', { alpha:false })` — so Chromium
  draws pdf.js's glyphs with ClearType like Acrobat (it follows Windows' ClearType setting). Measured first: the canvas
  was already 1:1 (Chromium pixel-snaps it; moving it by sub-pixels made it worse) — the difference was only grey vs
  ClearType anti-aliasing. A canvas held to the 4800 px limit is stretched and stays transparent (grey); thumbnails,
  print and exported images stay grey too. No devicePixelRatio cap (it was 2). Present sizes its canvas in CSS as
  canvas pixels / dpr. Test: sharp-screen-test.js.
```

- [ ] **Step 8: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html CLAUDE.md && git commit -m "feat: ClearType text on screen like Acrobat — opaque page canvases shown 1:1, no dpr cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Print at 600 dpi, lossless

Superseded during the work: print is 600 dpi JPEG 0.92 with a smart size check (500 MB budget) — see the spec, section B.

**Files:**
- Modify: `app/print.js` (near `PAPERS`, line 10; `go()`, around line 509; the export line 587)
- Modify: `CLAUDE.md` (the "Printing" bullet)
- Create (tests): `T\sharp-print-test.js`
- Modify (tests): `T\print-test.js` line 252 (the 300 dpi expectation)

**Interfaces:**
- Consumes: `T` folder from Task 1 (playwright-core, `notes-skip.js`).
- Produces: `window.SastraPrint.printQuality(sheets: number, paper: 'A4'|'A3'|'A5'|'Letter'|'Legal') → { dpi: number, type: 'image/png'|'image/jpeg' }`.

- [ ] **Step 1: Write the failing test** — create `T\sharp-print-test.js`:

```js
// Sharper printing (spec 2026-10-20-sharper-pages-design.md B): SastraPrint.printQuality = 600 dpi PNG up to 50
// A4-sized sheets (never past 64 MP a sheet: A3 → 575), 300 dpi PNG up to 150, then 150 dpi JPEG. A real print run
// (main's 'print' swapped for a recorder — never paper) sends 600 dpi sheets; Save as PDF stays 300 dpi.
const { _electron } = require('playwright-core');
const { PDFDocument, PDFName, PDFRawStream, StandardFonts } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const fs = require('fs'), path = require('path');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const OUT = path.join(T, 'out-sharp-print'), UD = path.join(T, 'ud-sharp-print');
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(150); } return false; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

(async () => {
  for (const d of [OUT, UD]) fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const TEN = path.join(OUT, 'ten.pdf');
  { const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 10; i++) d.addPage(i === 10 ? [841.89, 595.28] : [595.28, 841.89]).drawText(`page ${i}`, { x: 40, y: 500, size: 40, font: f });
    fs.writeFileSync(TEN, await d.save()); }
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, TEN], env });
  const page = await app.firstWindow(); await page.waitForLoadState('load');
  await require('./notes-skip')(page);
  await until(() => page.evaluate(() => document.querySelectorAll('#pages .page canvas').length > 0), 20000);

  // 1) the rule, as a pure function
  const q = await page.evaluate(() => {
    const f = (n, p) => { const r = SastraPrint.printQuality(n, p); return `${r.dpi} ${r.type.split('/')[1]}`; };
    return { a4_10: f(10, 'A4'), a4_50: f(50, 'A4'), a4_51: f(51, 'A4'), a4_150: f(150, 'A4'), a4_151: f(151, 'A4'),
      a3_25: f(25, 'A3'), a3_26: f(26, 'A3'), a5_100: f(100, 'A5'), letter_51: f(51, 'Letter'), legal_40: f(40, 'Legal') };
  }).catch(e => ({ error: e.message }));
  const want = { a4_10: '600 png', a4_50: '600 png', a4_51: '300 png', a4_150: '300 png', a4_151: '150 jpeg',
    a3_25: '575 png', a3_26: '300 png', a5_100: '600 png', letter_51: '600 png', legal_40: '600 png' };
  for (const k of Object.keys(want)) check(`printQuality ${k} → ${want[k]}`, q[k] === want[k], q[k] ?? q.error);

  // 2) a real print run: every sheet is a 600 dpi A4 picture (4961 × 7016), landscape page turned onto portrait paper
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('print'); globalThis.__prints = [];
    ipcMain.handle('print', async (e, opts) => {
      const tags = await e.sender.executeJavaScript(`[...document.querySelectorAll('#printArea img')].map(i => i.dataset.pages + '@' + i.naturalWidth + 'x' + i.naturalHeight)`);
      globalThis.__prints.push({ opts, tags }); return { ok: true, reason: '' };
    });
  });
  await page.keyboard.press('Control+p');
  await until(() => page.evaluate(() => !!document.querySelector('.modal.print')), 15000); await sleep(1500);
  await page.click('#prGo');
  await until(() => page.evaluate(() => !document.querySelector('.modal.print')));
  const got = await app.evaluate(() => globalThis.__prints[0] || null);
  check('print run sent 10 sheets', got?.tags.length === 10, got?.tags.length);
  check('every sheet is a 600 dpi A4 picture (4961 × 7016)', got?.tags.every(t => t.endsWith('@4961x7016')), got?.tags.join(' '));

  // 3) Save as PDF is unchanged: 300 dpi (A4 picture 2480 wide)
  // the Windows Save dialog answers by itself: same folder (OUT), the suggested name; main's handler writes the file
  await app.evaluate(({ dialog }, out) => {
    dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: out + '\\' + o.defaultPath.split(/[\\/]/).pop() });
  }, OUT);
  await page.keyboard.press('Control+p');
  await until(() => page.evaluate(() => !!document.querySelector('.modal.print')), 15000); await sleep(1500);
  await page.click('#prPdf');
  await until(() => page.evaluate(() => !document.querySelector('.modal.print')));
  const saved = path.join(OUT, 'ten-A4.pdf');
  await until(() => fs.existsSync(saved), 10000);
  const doc = await PDFDocument.load(fs.readFileSync(saved));
  const widths = doc.context.enumerateIndirectObjects().map(([, o]) => o).filter(o => o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')).map(o => o.dict.lookup(PDFName.of('Width')).asNumber());
  check('Save as PDF: still 300 dpi pictures (2480 wide on A4 portrait pages)', widths.length === 10 && widths.filter(w => w === 2480).length === 9, widths.join(','));

  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node sharp-print-test.js`
Expected: FAIL on every `printQuality …` line ("SastraPrint.printQuality is not a function") and on
"every sheet is a 600 dpi A4 picture" (sheets are `@2480x3508`); the Save as PDF line PASSES.

- [ ] **Step 3: Add `printQuality` in `app/print.js`** — right after the `const PAPERS = …` line (line 10), add:

```js
// Print resolution by job size, in A4-sized sheets (A3 counts 2, A5 ½): 600 dpi PNG — lossless, the office printers'
// own resolution, so letters come out as sharp as Acrobat's — up to 50; 300 dpi PNG up to 150; then 150 dpi JPEG so
// very long jobs stay light. A sheet never passes 64 MP (pdfops.js's canvas limit): A3 prints at 575 dpi.
function printQuality(sheets, paper){
  const [w, h] = PAPERS[paper] || PAPERS.A4, a4 = sheets * (w * h) / (210 * 297);
  const cap = Math.floor(Math.sqrt(64e6 / ((w / 25.4) * (h / 25.4))));
  return a4 <= 50 ? { dpi: Math.min(600, cap), type: 'image/png' } : a4 <= 150 ? { dpi: 300, type: 'image/png' } : { dpi: 150, type: 'image/jpeg' };
}
```

- [ ] **Step 4: Use it in `go()`** — in `app/print.js`, replace

```js
    const dpi = n > 150 ? 150 : 300, outW = Math.round(pw / 25.4 * dpi), outH = Math.round(ph / 25.4 * dpi);
```
with
```js
    const { dpi, type } = printQuality(n, S.paper), outW = Math.round(pw / 25.4 * dpi), outH = Math.round(ph / 25.4 * dpi);
```
and, a few lines below in the same loop, replace
```js
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); c.width = c.height = 0;
        const img = new Image(); img.className = 'psheet'; img.dataset.pages = sh.tag; img.alt = '';
```
with
```js
        const blob = await new Promise(r => c.toBlob(r, type, 0.92)); c.width = c.height = 0;   // quality: JPEG only
        const img = new Image(); img.className = 'psheet'; img.dataset.pages = sh.tag; img.alt = '';
```
(Only this occurrence — the one followed by `new Image()`. The `toBlob` in `savePdf` stays as it is.)

Then change the export line (line 587 before the edit):
```js
window.SastraPrint = { PAPERS, pickPages, planSheets, drawSheet, open };
```
to
```js
window.SastraPrint = { PAPERS, pickPages, planSheets, printQuality, drawSheet, open };
```

- [ ] **Step 5: Run the test to see it pass**

Run: `cd "$T" && unset ELECTRON_RUN_AS_NODE && node sharp-print-test.js`
Expected: `ALL PASS`.

- [ ] **Step 6: Update the old print suite and run the print suites**

In `T\print-test.js` line 252 replace
```js
        check('sheets are 300 dpi portrait images', /^1@2480x3508$/.test(r.tags[0]) && /^10@2480x3508$/.test(r.tags[9]), r.tags[0] + ' … ' + r.tags[9]);
```
with
```js
        check('sheets are 600 dpi portrait images', /^1@4961x7016$/.test(r.tags[0]) && /^10@4961x7016$/.test(r.tags[9]), r.tags[0] + ' … ' + r.tags[9]);
```
Run: `cd "$T" && rm -rf ud && unset ELECTRON_RUN_AS_NODE && node print-test.js && node print-screen-test.js`
Expected: print-test 71 PASS, print-screen-test 38 PASS (as on 2026-10-17). A print run now takes longer
(≈ 0.5 s more per sheet); if a check times out, raise only that wait.

- [ ] **Step 7: Update `CLAUDE.md`** — in the Printing bullet replace
"Printing draws every sheet with pdf.js (intent 'print') at 300 dpi
  (150 over 150 sheets) as JPEG into `#printArea`;" with
"Printing draws every sheet with pdf.js (intent 'print') into `#printArea` at the resolution
  `printQuality(sheets, paper)` picks (since 2026-10-20, "acrobat look sharper"): 600 dpi PNG up to 50 A4-sized sheets
  (A3 counts 2; never past 64 MP a sheet, so A3 = 575 dpi), 300 dpi PNG up to 150, then 150 dpi JPEG. Acrobat prints the
  page itself (vector); that was tried — a PDF in an Electron 44 window printed silently gives "Print job canceled" /
  "Failed to convert PDF: … PdfToEmfConverter" — so the sheets stay pictures. Save as PDF keeps 300 / 150 dpi JPEG;"

- [ ] **Step 8: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/print.js CLAUDE.md && git commit -m "feat: print at 600 dpi, lossless — sharper letters on paper (long jobs step down)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Check nothing else moved

**Files:**
- Modify: `CLAUDE.md` (Status)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: nothing new.

- [ ] **Step 1: Run the older suites that draw pages or print**

```bash
cd "$T" && unset ELECTRON_RUN_AS_NODE && mkdir -p out && cp pdfs/ten.pdf out/ten.pdf   # titlebar-test needs out\ten.pdf
node controls-test.js; node titlebar-test.js; node pages-panel-test.js; node ops-test.js
```
Expected: controls 15, titlebar 43, pages-panel 15, ops 10 — all PASS (numbers as on 2026-10-17). A one-off failure
while someone types into another window is the known "keys land in the test window" effect: re-run that suite.

- [ ] **Step 2: Add a Status line to `CLAUDE.md`** — at the end of the "## Status (2026-10-15)" list (before
"- Next steps:"), add:

```
- **Sharper pages (2026-10-20, on main, not released)**: ClearType text on screen and 600 dpi lossless print (spec/plan
  2026-10-20-sharper-pages*). Tests in this session's scratchpad `t\` (…\c2983e9f-…\scratchpad\t; the older suites were
  copied there from 4e4e0838): sharp-screen, sharp-print, print 71 (now expects 600 dpi), print-screen 38, controls,
  titlebar, pages-panel, ops. Not yet: the user's side-by-side check with Acrobat on screen and on paper.
```

- [ ] **Step 3: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add CLAUDE.md && git commit -m "docs: sharper pages — status and where the tests live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

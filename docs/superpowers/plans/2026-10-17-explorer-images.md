# Pictures in the Explorer Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> (2026-10-17: executed inline with superpowers:executing-plans — the user asked for the build, not for sub-agents.)

**Goal:** Right-click pictures (JPG/JPEG/JFIF, PNG, BMP, GIF, WebP) and/or PDFs in File Explorer → Sastra PDF ▸
"Combine N files" (2+ files) or "Make PDF" (1 picture) → one unsaved tab in the app, each picture page the picture's own size.

**Architecture:** A new classic script `app/images.js` (`window.SastraImages`) turns picture bytes into a pdf-lib page
(JPEG embedded as it is, PNG losslessly, BMP/GIF/WebP decoded by Chromium and stored as PNG; dpi and EXIF orientation
read by hand). `combinePaths` in `app/index.html` uses it for every file that isn't a PDF. The menu DLL learns the picture
extensions and a "Make PDF" item (task `combine` with one path); the package manifest registers every extension
(version 1.1.0.0); `explorer-menu.js` registers the classic keys per extension and lets pictures through the list file.
Spec: `docs/superpowers/specs/2026-10-17-explorer-images-design.md`.

**Tech Stack:** pdf-lib 1.17.1 (embedJpg/embedPng + raw content-stream operators), Chromium `createImageBitmap` /
`OffscreenCanvas` (Electron 44.7.2), C++17 + WRL (MSVC Build Tools), makeappx; tests: C++ harness, plain Node,
Playwright (`playwright-core`) — all outside the project.

## Global Constraints
- File types, exactly and in this order: `.pdf .jpg .jpeg .jfif .png .bmp .gif .webp` (case-insensitive). No HEIC, no TIFF.
- Package `SastraPDF.ExplorerMenu` Version `1.1.0.0` in AppxManifest.xml AND `PKG_VERSION` in explorer-menu.js
  (the build script fails if they, the CLSID or the file types disagree). CLSID stays `{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}`.
- Type of a file = its content (magic bytes), never its name: PDF `%PDF-` (within the first 1 KB, as Acrobat), JPEG
  `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, GIF `GIF8`, BMP `BM`, WebP `RIFF….WEBP`.
- Page size = pixels × 72 / dpi points; dpi from the file, unusable (missing, 0, < 10, > 10 000) → 96; sides capped at
  14 400 pt (scaled down, pixels kept). EXIF orientation 5–8 swaps width and height.
- JPEG is never re-compressed. No new library (About's credits don't change). No network.
- Tab name: one file → `<name without extension>.pdf`, more → `Combined.pdf`; unsaved; `d.saveDir` = first file's folder.
  Toasts: `Made photo.pdf · 1 page`, `Combined 5 files · 23 pages`, `… . Couldn't read: a.webp, b.pdf` (error style when
  something was skipped), nothing readable → `No PDF made. Couldn't read: …` (error), no tab.
- "Open with" stays PDF-only; main.js does not change.
- Electron launches: `unset ELECTRON_RUN_AS_NODE` (bash) / `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`
  (PowerShell); Playwright launches use `--user-data-dir=<scratch>`; poll with `page.evaluate` (CSP blocks `waitForFunction`).
  Never kill processes by name — only a PID this session started.
- `<S>` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad`;
  tests in `<S>\t\`. Old tests: `<OLD>` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66\scratchpad\t`
  and `…\5bba040e-d748-40b4-82a1-9c53fb3ecd62\scratchpad\t\titlebar-test.js`.
- Commits only on `feat/explorer-images`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No merge, no push.
- The real menu, installing over the user's copy and the release version number need the user (Task 6).

## File Structure
| File | Status | Responsibility |
|---|---|---|
| `app/images.js` | new | `window.SastraImages`: `kind`, `jpegInfo`, `pngDpi`, `bmpDpi`, `pageSize`, `addImagePage` |
| `app/index.html` | modify | loads images.js; `combinePaths` takes pictures, new names/toasts |
| `explorer-menu.js` | modify | `EXTS`; `readTaskList` lets pictures through; classic keys per extension; `PKG_VERSION` 1.1.0.0 |
| `explorer-menu/menu.cpp` | modify | selection scan (PDFs + pictures), "Make PDF", visibility rules, what each item sends |
| `explorer-menu/AppxManifest.xml` | modify | one ItemType per extension, Version 1.1.0.0, description |
| `scripts/build-explorer-menu.js` | modify | checks the file types match in menu.cpp, the manifest and explorer-menu.js |
| `CLAUDE.md`, `README.md`, `docs/HISTORY.md` | modify | document it |
| `<S>\t\pictures.js` | new (test) | hand-made test pictures and header blocks (JFIF, EXIF, pHYs, BMP, GIF) |
| `<S>\t\images-test.js` | new (test) | SastraImages in the app's page, incl. drawing every orientation with pdf.js |
| `<S>\t\unit-test.js`, `menu-test-combine.js`, `harness\menu-harness.cpp`, `harness\make-files.js` | modify (test) | |

---

### Task 1: `app/images.js` — pictures → PDF pages

**Files:**
- Create: `app/images.js`
- Modify: `app/index.html:448` (add the script tag)
- Test: `<S>\t\pictures.js`, `<S>\t\images-test.js`

**Interfaces:**
- Consumes: global `PDFLib` (pdf-lib, loaded before it), `SastraOps` (tests only: `pdfjs`, `PDFJS_OPTS`, `renderPage`, `closePdf`).
- Produces: `window.SastraImages = { kind(bytes) → 'pdf'|'jpeg'|'png'|'gif'|'bmp'|'webp'|null, jpegInfo(bytes) →
  { orientation: 1–8, dpi: number|null }, pngDpi(bytes) → number|null, bmpDpi(bytes) → number|null,
  pageSize(w, h, dpi, orientation) → { width, height } (points), addImagePage(pdfDoc, bytes) → Promise<{ width, height }> }`
  (`bytes` = Uint8Array; `addImagePage` rejects when the bytes are not a picture it can read; dpi values are rounded to 2 decimals).

- [ ] **Step 1: Set up the test folder**

```bash
S=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad
OLD=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/77cc72c7-39f4-41f5-bdf5-3b1c2d3b3c66/scratchpad/t
mkdir -p $S/t/harness
cp $OLD/{package.json,menu-test.js,menu-test-combine.js,unit-test.js,ops-test.js,nozip-test.js,print-test.js,close-test.js} $S/t/
cp -r $OLD/node_modules $OLD/pdfs $S/t/
cp $OLD/harness/{menu-harness.cpp,stub.cpp,build.bat,make-files.js} $S/t/harness/
cp /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/5bba040e-d748-40b4-82a1-9c53fb3ecd62/scratchpad/t/titlebar-test.js $S/t/
ls $S/t
```
Expected: the files above plus `node_modules/` and `pdfs/`.

- [ ] **Step 2: Write the test-picture helper `<S>\t\pictures.js`**

```js
// Test pictures made by hand (no libraries): JPEG header blocks (JFIF / EXIF), PNG pHYs chunks, BMP and GIF files.
// JPEG / PNG / WebP pixels come from Chromium in the test app (canvasPicture); these add or build the headers.
const zlib = require('zlib');
const u16be = n => [n >> 8 & 255, n & 255], u32be = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const u16le = n => [n & 255, n >> 8 & 255], u32le = n => [n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255];
const seg = (marker, body) => Buffer.from([0xFF, marker, ...u16be(body.length + 2), ...body]);

// JFIF APP0: unit 0 = aspect only, 1 = dots per inch, 2 = dots per cm
const app0 = (unit, density) => seg(0xE0, [...Buffer.from('JFIF\0'), 1, 1, unit, ...u16be(density), ...u16be(density), 0, 0]);
// EXIF APP1, IFD0 with Orientation / XResolution [num, den] / ResolutionUnit. le = little-endian ('II').
function app1({ le = false, orientation, xres, unit } = {}) {
  const w16 = le ? u16le : u16be, w32 = le ? u32le : u32be, tags = [];
  if (orientation !== undefined) tags.push([0x0112, 3, [...w16(orientation), 0, 0]]);
  if (xres) tags.push([0x011A, 5, null]);   // value = offset of the rational, after the IFD
  if (unit !== undefined) tags.push([0x0128, 3, [...w16(unit), 0, 0]]);
  const dataAt = 8 + 2 + tags.length * 12 + 4;
  const tiff = [...Buffer.from(le ? 'II' : 'MM'), ...w16(42), ...w32(8), ...w16(tags.length)];
  for (const [tag, type, val] of tags) tiff.push(...w16(tag), ...w16(type), ...w32(1), ...(val || w32(dataAt)));
  tiff.push(...w32(0));
  if (xres) tiff.push(...w32(xres[0]), ...w32(xres[1]));
  return seg(0xE1, [...Buffer.from('Exif\0\0'), ...tiff]);
}
// broken EXIF: the IFD offset points far past the end
const app1Broken = () => seg(0xE1, [...Buffer.from('Exif\0\0'), ...Buffer.from('MM'), ...u16be(42), ...u32be(5000)]);
// headers only (enough for jpegInfo): SOI, the blocks, a stub SOS, EOI
const jpegHead = (...blocks) => Buffer.concat([Buffer.from([0xFF, 0xD8]), ...blocks, Buffer.from([0xFF, 0xDA, 0, 2, 0xFF, 0xD9])]);
// a real JPEG with its leading APP0/APP1 blocks replaced by the given ones
function jpegWith(jpeg, ...blocks) {
  let i = 2;
  while (jpeg[i] === 0xFF && (jpeg[i + 1] === 0xE0 || jpeg[i + 1] === 0xE1)) i += 2 + jpeg.readUInt16BE(i + 2);
  return Buffer.concat([jpeg.subarray(0, 2), ...blocks, jpeg.subarray(i)]);
}

// PNG chunk with its CRC; pHYs in pixels per metre (unit 1 = metre, 0 = aspect only)
function chunk(type, data) {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  return Buffer.concat([Buffer.from(u32be(data.length)), td, Buffer.from(u32be(zlib.crc32(td)))]);
}
const phys = (ppm, unit = 1) => chunk('pHYs', [...u32be(ppm), ...u32be(ppm), unit]);
const pngWith = (png, c) => Buffer.concat([png.subarray(0, 33), c, png.subarray(33)]);   // after signature (8) + IHDR (25)
const pngHead = (...chunks) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10]),
  chunk('IHDR', [...u32be(1), ...u32be(1), 8, 2, 0, 0, 0]), ...chunks, chunk('IDAT', []), chunk('IEND', [])]);

// 24-bit BMP; px(x, y) → [r, g, b], y = 0 is the top row (BMP stores rows bottom-up)
function bmp(w, h, px, ppm = 0) {
  const row = Math.ceil(w * 3 / 4) * 4, size = 54 + row * h, b = Buffer.alloc(size);
  b.write('BM', 0, 'latin1'); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34); b.writeInt32LE(ppm, 38); b.writeInt32LE(ppm, 42);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, bl] = px(x, y), o = 54 + (h - 1 - y) * row + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r;
  }
  return b;
}
// the old 12-byte BMP header: no pixels per metre
const bmpCore = () => { const b = Buffer.alloc(26); b.write('BM', 0, 'latin1'); b.writeUInt32LE(26, 2); b.writeUInt32LE(26, 10); b.writeUInt32LE(12, 14); return b; };

// GIF, one frame per px function (px(x, y) → palette index 0–127). LZW without compression: 8-bit codes,
// a clear code every 100 pixels so the code size never grows.
function gif(w, h, palette, ...frames) {
  const out = [...Buffer.from('GIF89a'), ...u16le(w), ...u16le(h), 0xF6, 0, 0];   // global table of 128 colours
  for (let i = 0; i < 128; i++) out.push(...(palette[i] || [0, 0, 0]));
  out.push(0x21, 0xFF, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (const px of frames) {
    out.push(0x21, 0xF9, 4, 0, 50, 0, 0, 0);
    out.push(0x2C, 0, 0, 0, 0, ...u16le(w), ...u16le(h), 0, 7);
    const codes = [];
    for (let k = 0; k < w * h; k++) { if (k % 100 === 0) codes.push(128); codes.push(px(k % w, Math.floor(k / w))); }
    codes.push(129);
    for (let i = 0; i < codes.length; i += 255) { const s = codes.slice(i, i + 255); out.push(s.length, ...s); }
    out.push(0);
  }
  out.push(0x3B);
  return Buffer.from(out);
}

// four coloured quarters: top-left red, top-right green, bottom-left blue, bottom-right yellow
const quad = (w, h) => (x, y) => y < h / 2 ? (x < w / 2 ? [255, 0, 0] : [0, 255, 0]) : (x < w / 2 ? [0, 0, 255] : [255, 255, 0]);
// the same quarters drawn by Chromium in the test app's page → JPEG / PNG / WebP bytes. alphaLeft: left half transparent.
async function canvasPicture(page, type, w, h, { alphaLeft = false } = {}) {
  return Buffer.from(await page.evaluate(async ([type, w, h, alphaLeft]) => {
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    for (const [col, i, j] of [['#f00', 0, 0], ['#0f0', 1, 0], ['#00f', 0, 1], ['#ff0', 1, 1]]) { x.fillStyle = col; x.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); }
    if (alphaLeft) x.clearRect(0, 0, w / 2, h);
    return [...new Uint8Array(await (await c.convertToBlob({ type, quality: 0.95 })).arrayBuffer())];
  }, [type, w, h, alphaLeft]));
}

module.exports = { app0, app1, app1Broken, jpegHead, jpegWith, chunk, phys, pngWith, pngHead, bmp, bmpCore, gif, quad, canvasPicture };
```

- [ ] **Step 3: Write the failing test `<S>\t\images-test.js`**

```js
// SastraImages (app/images.js) in the main window: types, dpi, orientation, page sizes, and how the pages really
// look when pdf.js draws them (every EXIF orientation compared with how Chromium shows the photo). PACKED=1: dist\win-unpacked.
const { _electron } = require('playwright-core');
const path = require('path');
const P = require('./pictures.js');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname;
const EXE = process.env.PACKED === '1' ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = process.env.PACKED === '1' ? [] : [APP];
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + info : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, d = 0.05) => Math.abs(a - b) <= d;
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + path.join(T, 'ud-img')], env });
  const page = await app.firstWindow(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (let k = 0; k < 100 && !(await page.evaluate(() => !!window.SastraOps)); k++) await sleep(100);
  const loaded = await page.evaluate(() => typeof window.SastraImages === 'object' && !!window.SastraImages);
  check('SastraImages loaded', loaded);
  if (!loaded) { await app.close(); console.log('\n1 FAILED'); process.exit(1); }
  const call = (fn, ...bufs) => page.evaluate(([fn, bufs]) => SastraImages[fn](...bufs.map(a => new Uint8Array(a))), [fn, bufs.map(b => [...b])]);

  // 1) kind: from the bytes, not the name
  const png = await P.canvasPicture(page, 'image/png', 40, 20), jpg = await P.canvasPicture(page, 'image/jpeg', 40, 20), webp = await P.canvasPicture(page, 'image/webp', 40, 20);
  const samples = [png, jpg, webp, P.gif(2, 2, [[255, 0, 0]], () => 0), P.bmp(2, 2, () => [0, 0, 0]), Buffer.from('%PDF-1.7\n'),
    Buffer.concat([Buffer.alloc(300, 32), Buffer.from('%PDF-1.4\n')]), Buffer.concat([Buffer.alloc(1100, 32), Buffer.from('%PDF-1.4\n')]),
    Buffer.from('hello world'), Buffer.alloc(0), Buffer.from('RIFF\0\0\0\0WAVEfmt ')];
  const kinds = await page.evaluate(list => list.map(a => SastraImages.kind(new Uint8Array(a))), samples.map(b => [...b]));
  check('kind: png jpeg webp gif bmp pdf; PDF header after 300 junk bytes yes, after 1100 no; text, empty, WAVE → none',
    kinds.join() === 'png,jpeg,webp,gif,bmp,pdf,pdf,,,,', kinds.join());

  // 2) jpegInfo
  const ji = async (name, blocks, want) => { const r = await call('jpegInfo', P.jpegHead(...blocks)); check('jpegInfo: ' + name, r.orientation === want[0] && r.dpi === want[1], JSON.stringify(r)); };
  await ji('nothing → orientation 1, no dpi', [], [1, null]);
  await ji('JFIF 300 dpi', [P.app0(1, 300)], [1, 300]);
  await ji('JFIF 118 dots/cm → 299.72 dpi', [P.app0(2, 118)], [1, 299.72]);
  await ji('JFIF aspect only, EXIF 72 dpi', [P.app0(0, 1), P.app1({ xres: [72, 1], unit: 2 })], [1, 72]);
  await ji('JFIF 300 wins over EXIF 72', [P.app0(1, 300), P.app1({ xres: [72, 1], unit: 2 })], [1, 300]);
  await ji('JFIF 5 dpi (unusable) → EXIF 200 (no unit = inch)', [P.app0(1, 5), P.app1({ xres: [200, 1] })], [1, 200]);
  await ji('EXIF big-endian: orientation 6, 300 dpi', [P.app1({ orientation: 6, xres: [300, 1], unit: 2 })], [6, 300]);
  await ji('EXIF little-endian: orientation 3', [P.app1({ le: true, orientation: 3 })], [3, null]);
  await ji('EXIF orientation 8, 100 per cm → 254 dpi', [P.app1({ le: true, orientation: 8, xres: [100, 1], unit: 3 })], [8, 254]);
  await ji('EXIF unit 1 (no unit) → no dpi', [P.app1({ xres: [300, 1], unit: 1 })], [1, null]);
  await ji('EXIF orientation 9 (invalid) → 1', [P.app1({ orientation: 9 })], [1, null]);
  await ji('EXIF resolution 0/0 → no dpi', [P.app1({ xres: [0, 0] })], [1, null]);
  await ji('broken EXIF → ignored', [P.app1Broken()], [1, null]);
  await ji('broken EXIF + JFIF 150 → 150', [P.app0(1, 150), P.app1Broken()], [1, 150]);

  // 3) pngDpi / bmpDpi
  const pd = async (name, bytes, want) => { const r = await call('pngDpi', bytes); check('pngDpi: ' + name, r === want, String(r)); };
  await pd('no pHYs → none', P.pngHead(), null);
  await pd('11811 per metre → 300', P.pngHead(P.phys(11811)), 300);
  await pd('3780 per metre → 96.01', P.pngHead(P.phys(3780)), 96.01);
  await pd('unit 0 (aspect only) → none', P.pngHead(P.phys(11811, 0)), null);
  const head = P.pngHead();
  await pd('pHYs after the image data → ignored', Buffer.concat([head.subarray(0, head.length - 12), P.phys(11811), head.subarray(head.length - 12)]), null);
  await pd('a real PNG from Chromium + pHYs 300', P.pngWith(png, P.phys(11811)), 300);
  const bd = async (name, bytes, want) => { const r = await call('bmpDpi', bytes); check('bmpDpi: ' + name, r === want, String(r)); };
  await bd('5906 per metre → 150.01', P.bmp(2, 2, () => [0, 0, 0], 5906), 150.01);
  await bd('0 → none', P.bmp(2, 2, () => [0, 0, 0], 0), null);
  await bd('old 12-byte header → none', P.bmpCore(), null);

  // 4) pageSize
  const ps = await page.evaluate(() => [[960, 480, null, 1], [960, 480, 5, 1], [300, 150, 150, 1], [4032, 3024, 72, 6], [200, 100, null, 8],
    [20000, 10000, 96, 1], [20000, 10000, 96, 5], [400, 400, 20000, 1]].map(a => SastraImages.pageSize(...a)).map(s => `${+s.width.toFixed(2)}x${+s.height.toFixed(2)}`));
  const want = ['720x360', '720x360', '144x72', '3024x4032', '75x150', '14400x7200', '7200x14400', '300x300'];
  const names = ['no dpi → 96', '5 dpi (unusable) → 96', '150 dpi', 'phone photo 4032×3024, 72 dpi, orientation 6 → portrait', 'orientation 8 swaps',
    '15 000 pt wide → scaled to 14 400', '… turned (5) → 7200 × 14400', '20 000 dpi (unusable) → 96'];
  names.forEach((n, i) => check('pageSize: ' + n, ps[i] === want[i], ps[i]));

  // 5) addImagePage, drawn by pdf.js, sampled at the quarter centres (TL, TR, BL, BR)
  const build = list => page.evaluate(async list => {
    const PTS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    const label = ([r, g, b]) => r > 200 && g > 200 && b > 200 ? 'white' : r > 150 && g > 150 ? 'yellow' : r > 150 ? 'red' : g > 150 ? 'green' : b > 150 ? 'blue' : 'other';
    const sample = bm => { const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0);
      return PTS.map(([fx, fy]) => label(x.getImageData(Math.floor(fx * bm.width), Math.floor(fy * bm.height), 1, 1).data)); };
    const doc = await PDFLib.PDFDocument.create(), res = [];
    for (const a of list) {
      const bytes = new Uint8Array(a), r = {};
      try { const s = await SastraImages.addImagePage(doc, bytes); r.size = [+s.width.toFixed(2), +s.height.toFixed(2)]; r.page = doc.getPageCount() - 1; }
      catch (e) { r.error = String(e?.message || e); }
      try { r.chromium = sample(await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' })); } catch {}
      res.push(r);
    }
    const pdf = await doc.save({ useObjectStreams: false });
    const d = await (await SastraOps.pdfjs()).getDocument({ data: pdf.slice(), ...SastraOps.PDFJS_OPTS }).promise;
    for (const r of res) if (r.page !== undefined) {
      const vp = (await d.getPage(r.page + 1)).getViewport({ scale: 1 }); r.pdfSize = [+vp.width.toFixed(2), +vp.height.toFixed(2)];
      r.drawn = sample(await createImageBitmap((await SastraOps.renderPage(d, r.page, 144, 'image/png')).blob));
    }
    await SastraOps.closePdf(d);
    const text = new TextDecoder('latin1').decode(pdf);
    return { res, pages: doc.getPageCount(), smask: (text.match(/\/SMask/g) || []).length, dct: (text.match(/\/DCTDecode/g) || []).length, pdf: [...pdf] };
  }, list.map(b => [...b]));

  const base = await P.canvasPicture(page, 'image/jpeg', 200, 100);   // stored landscape, four coloured quarters
  const jpegs = [1, 2, 3, 4, 5, 6, 7, 8].map(o => P.jpegWith(base, P.app1({ orientation: o })));
  const J = await build(jpegs);
  for (let o = 1; o <= 8; o++) {
    const x = J.res[o - 1], w = o >= 5 ? '75,150' : '150,75';
    check(`JPEG orientation ${o}: page ${w.replace(',', ' × ')} pt`, x.size?.join() === w && x.pdfSize?.join() === w, `${x.size} / ${x.pdfSize} ${x.error || ''}`);
    check(`JPEG orientation ${o}: drawn the way Chromium shows the photo`, !!x.drawn && x.drawn.join() === x.chromium?.join() && !x.drawn.includes('other'), `${x.drawn} vs ${x.chromium}`);
  }
  check('orientation 6 by hand: blue, red / yellow, green', J.res[5].drawn?.join() === 'blue,red,yellow,green', String(J.res[5].drawn));
  check('JPEG goes in as it is (DCTDecode, same bytes inside the PDF)', J.dct === 8 && Buffer.from(J.pdf).indexOf(jpegs[5]) >= 0, `dct ${J.dct}`);

  const pngA = P.pngWith(await P.canvasPicture(page, 'image/png', 300, 150, { alphaLeft: true }), P.phys(11811));
  const pdfBytes = Buffer.from(J.pdf);
  const O = await build([pngA, P.bmp(300, 150, P.quad(300, 150), 5906), P.gif(120, 90, [[0, 255, 0], [255, 0, 0]], () => 0, () => 1),
    await P.canvasPicture(page, 'image/webp', 160, 120), Buffer.from('not a picture'), pdfBytes, P.gif(17000, 4, [[0, 0, 0]], () => 0)]);
  const [rPng, rBmp, rGif, rWebp, rText, rPdf, rHuge] = O.res;
  check('PNG 300 × 150 at 300 dpi → 72 × 36 pt', rPng.size?.join() === '72,36', String(rPng.size));
  check('PNG transparency kept (soft mask), white page behind it', O.smask >= 1 && rPng.drawn?.join() === 'white,green,white,yellow', `${O.smask} ${rPng.drawn}`);
  check('BMP 300 × 150 at 150 dpi → 144 × 72 pt, colours right way up', near(rBmp.size?.[0], 144) && near(rBmp.size?.[1], 72) && rBmp.drawn?.join() === 'red,green,blue,yellow', `${rBmp.size} ${rBmp.drawn}`);
  check('GIF: first frame only (green), 96 dpi → 90 × 67.5 pt', rGif.size?.join() === '90,67.5' && rGif.drawn?.join() === 'green,green,green,green', `${rGif.size} ${rGif.drawn}`);
  check('WebP 160 × 120 → 120 × 90 pt', rWebp.size?.join() === '120,90' && rWebp.drawn?.join() === 'red,green,blue,yellow', `${rWebp.size} ${rWebp.drawn}`);
  check('text → rejected', !!rText.error && rText.page === undefined, rText.error);
  check('a PDF is not a picture → rejected', !!rPdf.error && rPdf.page === undefined, rPdf.error);
  check('GIF wider than 16 384 px → rejected (canvas limit)', !!rHuge.error && rHuge.page === undefined, rHuge.error);
  check('4 pages made (rejected files add none)', O.pages === 4, O.pages);

  check('no console errors', errors.length === 0, errors.join(' | '));
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```

- [ ] **Step 4: Run it to make sure it fails**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && unset ELECTRON_RUN_AS_NODE && node images-test.js
```
Expected: `FAIL  SastraImages loaded` and `1 FAILED`.

- [ ] **Step 5: Write `app/images.js`**

```js
// Sastra PDF — pictures → PDF pages, for "Make PDF" / "Combine" from the File Explorer menu. Classic script:
// window.SastraImages (needs pdf-lib). JPEG goes in as it is and PNG without loss; BMP, GIF (first frame) and WebP
// are decoded by Chromium and stored as PNG. Each page is the picture's own size: pixels × 72 / dpi, the dpi
// from the file, else 96. Phone photos are turned the way their EXIF orientation says.
(() => {
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
  const DEFAULT_DPI = 96, MAX_PT = 14400;   // 200 in: the largest page most PDF readers accept
  const MAX_SIDE = 16384, MAX_PIXELS = 64e6;   // past this a canvas fails or eats gigabytes (as SastraOps.renderPage)
  const usable = d => d >= 10 && d <= 10000 ? Math.round(d * 100) / 100 : null;   // missing, 0 or silly → null
  const ascii = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);

  // What the bytes are, whatever the file is called: 'pdf' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | null
  function kind(b) {
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (ascii(b, 0, '\x89PNG\r\n\x1A\n')) return 'png';
    if (ascii(b, 0, 'GIF8')) return 'gif';
    if (ascii(b, 0, 'BM')) return 'bmp';
    if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
    for (let i = 0; i <= Math.min(1024, b.length - 5); i++) if (ascii(b, i, '%PDF-')) return 'pdf';   // as Acrobat: within the first 1 KB
    return null;
  }

  // The EXIF block's TIFF part → { orientation, dpi }. Throws when it's broken (DataView range errors).
  function readExif(t) {
    const le = t.getUint16(0) === 0x4949;   // 'II' little-endian, 'MM' big-endian
    if (!le && t.getUint16(0) !== 0x4D4D) throw new Error('not TIFF');
    const u16 = o => t.getUint16(o, le), u32 = o => t.getUint32(o, le);
    if (u16(2) !== 42) throw new Error('not TIFF');
    const ifd = u32(4), n = u16(ifd);
    let orientation = 1, res = null, unit = 2;   // ResolutionUnit: 1 none, 2 inch (default), 3 cm
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12, tag = u16(e);
      if (tag === 0x0112) { const o = u16(e + 8); if (o >= 1 && o <= 8) orientation = o; }
      else if (tag === 0x011A) { const at = u32(e + 8), den = u32(at + 4); res = den ? u32(at) / den : null; }
      else if (tag === 0x0128) unit = u16(e + 8);
    }
    return { orientation, dpi: usable(res === null ? 0 : unit === 3 ? res * 2.54 : unit === 2 ? res : 0) };
  }
  // JPEG → { orientation 1–8, dpi or null }: JFIF density first, then EXIF XResolution. A broken EXIF block is ignored.
  function jpegInfo(b) {
    const v = view(b); let orientation = 1, jfif = null, exif = null, i = 2;
    while (i + 4 <= b.length && b[i] === 0xFF) {
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }   // fill byte
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }   // markers without a length
      if (m === 0xDA || m === 0xD9) break;   // the image data starts: no more headers
      const len = v.getUint16(i + 2), s = i + 4;
      if (m === 0xE0 && ascii(b, s, 'JFIF\0') && s + 12 <= b.length) {
        const unit = b[s + 7], x = v.getUint16(s + 8);
        jfif = usable(unit === 1 ? x : unit === 2 ? x * 2.54 : 0);
      } else if (m === 0xE1 && ascii(b, s, 'Exif\0\0')) {
        try {
          const e = readExif(new DataView(b.buffer, b.byteOffset + s + 6, Math.max(0, Math.min(len - 8, b.length - s - 6))));
          orientation = e.orientation; exif = e.dpi;
        } catch {}
      }
      i += 2 + len;
    }
    return { orientation, dpi: jfif ?? exif };
  }
  // PNG → dpi from pHYs (pixels per metre, unit 1), which must come before the image data
  function pngDpi(b) {
    const v = view(b);
    for (let i = 8; i + 8 <= b.length; ) {
      const len = v.getUint32(i), type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      if (type === 'IDAT' || type === 'IEND') break;
      if (type === 'pHYs' && len >= 9 && i + 17 <= b.length) return b[i + 16] === 1 ? usable(v.getUint32(i + 8) * 0.0254) : null;
      i += 12 + len;
    }
    return null;
  }
  // BMP → dpi from the header's horizontal pixels per metre (the old 12-byte header has none)
  function bmpDpi(b) {
    if (b.length < 42) return null;
    const v = view(b);
    return v.getUint32(14, true) >= 40 ? usable(v.getInt32(38, true) * 0.0254) : null;
  }

  // Page size in points for a w × h picture: × 72 / dpi (96 when unusable); orientations 5–8 turn it a quarter, so
  // width and height swap. A side over 14 400 pt is scaled down with the other (the picture keeps its pixels).
  function pageSize(w, h, dpi, orientation = 1) {
    const d = usable(dpi) ?? DEFAULT_DPI;
    let width = w * 72 / d, height = h * 72 / d;
    if (orientation >= 5) [width, height] = [height, width];
    const s = Math.min(1, MAX_PT / Math.max(width, height));
    return { width: width * s, height: height * s };
  }
  // Puts the picture (a 1 × 1 square in PDF, its top row at the top) on a W × H page, turned / mirrored the way
  // EXIF orientation 1–8 says.
  const placement = (o, W, H) => ({ 2: [-W, 0, 0, H, W, 0], 3: [-W, 0, 0, -H, W, H], 4: [W, 0, 0, -H, 0, H], 5: [0, -H, -W, 0, W, H],
    6: [0, -H, W, 0, 0, H], 7: [0, H, W, 0, 0, 0], 8: [0, H, -W, 0, W, 0] })[o] || [W, 0, 0, H, 0, 0];

  // BMP / GIF (first frame) / WebP → PNG bytes, decoded by Chromium
  async function toPng(bytes, type) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/' + type }));
    try {
      if (Math.max(bmp.width, bmp.height) > MAX_SIDE || bmp.width * bmp.height > MAX_PIXELS) throw new Error('the picture is too large');
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0);
      return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    } finally { bmp.close(); }
  }

  // Adds the picture as the last page of a pdf-lib document → { width, height } in points. Rejects (adding nothing)
  // when the bytes are not a picture it can read.
  async function addImagePage(doc, bytes) {
    const k = kind(bytes); let img, dpi = null, orientation = 1;
    if (k === 'jpeg') { ({ orientation, dpi } = jpegInfo(bytes)); img = await doc.embedJpg(bytes); }
    else if (k === 'png') { dpi = pngDpi(bytes); img = await doc.embedPng(bytes); }
    else if (k === 'bmp' || k === 'gif' || k === 'webp') { if (k === 'bmp') dpi = bmpDpi(bytes); img = await doc.embedPng(await toPng(bytes, k)); }
    else throw new Error('not a supported picture');
    if (!(img.width > 0 && img.height > 0)) throw new Error('the picture has no size');
    const { width, height } = pageSize(img.width, img.height, dpi, orientation);
    const page = doc.addPage([width, height]);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placement(orientation, width, height)),
      drawObject(page.node.newXObject('Image', img.ref)), popGraphicsState());
    return { width, height };
  }

  window.SastraImages = { kind, jpegInfo, pngDpi, bmpDpi, pageSize, addImagePage };
})();
```

- [ ] **Step 6: Load it in the main window** — `app/index.html`, after `<script src="pdfops.js"></script>`:

```html
<script src="images.js"></script>
```

- [ ] **Step 7: Run the test until it passes**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && unset ELECTRON_RUN_AS_NODE && node images-test.js
```
Expected: every line `PASS`, then `ALL PASS`. A failing orientation means the `placement` table is wrong for it: fix the
table (the "by hand" check for 6 and Chromium's own view decide), never the test.

- [ ] **Step 8: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/images.js app/index.html && git commit -m "feat: pictures to PDF pages (app/images.js)

JPEG as it is (EXIF orientation applied), PNG lossless, BMP/GIF/WebP via
Chromium; page = the picture's own size from its dpi, else 96, max 14 400 pt.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `explorer-menu.js` — pictures in list files and classic keys

**Files:**
- Modify: `explorer-menu.js` (constants, `readTaskList`, `verbKey`, `registerClassic`, `unregisterClassic`, `classicRegistered`, exports)
- Test: `<S>\t\unit-test.js`

**Interfaces:**
- Produces: `EXTS = ['.pdf', '.jpg', '.jpeg', '.jfif', '.png', '.bmp', '.gif', '.webp']` (exported; Task 4's build script
  reads it); `readTaskList(file, tempDir)` → existing absolute paths with one of `EXTS`, name order; classic keys
  `<classes>\SystemFileAssociations\<ext>\shell\SastraPDF` for every ext.

- [ ] **Step 1: Add the failing checks to `<S>\t\unit-test.js`**

After the line `check('list not named menu-*.txt: ignored and kept', …); fs.unlinkSync(other);` add:

```js
// pictures (2026-10-17): the 7 picture types go through, other types don't
check('EXTS: PDF + 7 picture types', (m.EXTS || []).join(' ') === '.pdf .jpg .jpeg .jfif .png .bmp .gif .webp', String(m.EXTS));
for (const n of ['photo.JPG', 'scan.png', 'c.jpeg', 'd.jfif', 'e.bmp', 'f.gif', 'g.webp', 'h.tif', 'i.heic']) fs.writeFileSync(P(n), 'x');
const lf2 = path.join(LISTS, 'menu-unit-2.txt');
fs.writeFileSync(lf2, ['photo.JPG', 'h.tif', 'scan.png', 'Test 01.pdf', 'i.heic', 'c.jpeg', 'd.jfif', 'e.bmp', 'f.gif', 'g.webp', 'notes.txt'].map(P).join('\n'));
const got2 = m.readTaskList(lf2).map(p => path.basename(p));
check('list: pictures and PDFs, name order; .tif .heic .txt dropped', got2.join('|') === 'c.jpeg|d.jfif|e.bmp|f.gif|g.webp|photo.JPG|scan.png|Test 01.pdf', got2.join('|'));
```

Replace the classic-registration block (from `check('verb → CLSID', …)` to `check('unregisterClassic removes both keys', …)`) with:

```js
const verb = ext => `${ROOT}\\SystemFileAssociations\\${ext}\\shell\\SastraPDF`;
for (const ext of m.EXTS || ['.pdf']) check(`verb for ${ext} → CLSID, MultiSelectModel Player`, q(verb(ext), 'ExplorerCommandHandler').includes(m.CLSID) && q(verb(ext), 'MultiSelectModel').includes('Player'));
check('classicRegistered', m.classicRegistered(ROOT));
spawnSync('reg.exe', ['delete', verb('.webp'), '/f']);
check('classicRegistered: false when one type is missing (an update from 1.0.x registers again)', !m.classicRegistered(ROOT));
m.registerClassic('C:\\x y\\SastraMenu.dll', ROOT);
m.unregisterClassic(ROOT);
check('unregisterClassic removes every type and the CLSID', (m.EXTS || ['.pdf']).every(ext => !q(verb(ext), 'ExplorerCommandHandler').includes(m.CLSID)) && !q(`${ROOT}\\CLSID\\${m.CLSID}\\InprocServer32`).includes('SastraMenu'));
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && node unit-test.js
```
Expected: FAIL on `EXTS`, `list: pictures and PDFs`, the 7 picture `verb for …` lines (only `.pdf` passes), and
`classicRegistered: false when one type is missing`.

- [ ] **Step 3: Change `explorer-menu.js`**

Header comment, first line → `// Sastra PDF — File Explorer right-click menu for PDFs and pictures: registering it (installer hooks, see build/installer.nsh) and`.

After `const TASKS = …;` add:
```js
// The file types the menu is shown for: = the ItemTypes in AppxManifest.xml and the list in menu.cpp (the build script checks)
const EXTS = ['.pdf', '.jpg', '.jpeg', '.jfif', '.png', '.bmp', '.gif', '.webp'];
```

In `readTaskList`, the comment's last sentence → `Returns existing PDFs and pictures (EXTS) in name order — 01, 02, 10, like Explorer (the menu hands them over in its own order).`
and the filter line:
```js
    if (!p || !EXTS.includes(path.extname(p).toLowerCase()) || !path.isAbsolute(p)) return false;
```

Classic menu block:
```js
/* ---------- classic menu (HKCU) ---------- */
const verbKey = (classes, ext) => `${classes}\\SystemFileAssociations\\${ext}\\shell\\SastraPDF`;
const clsidKey = classes => `${classes}\\CLSID\\${CLSID}`;
function registerClassic(dll, classes = CLASSES) {
  const steps = [
    [clsidKey(classes), '/ve', '/d', 'Sastra PDF Explorer menu'],
    [clsidKey(classes) + '\\InprocServer32', '/ve', '/d', dll],
    [clsidKey(classes) + '\\InprocServer32', '/v', 'ThreadingModel', '/d', 'Apartment'],
    ...EXTS.flatMap(ext => [
      [verbKey(classes, ext), '/v', 'ExplorerCommandHandler', '/d', CLSID],
      [verbKey(classes, ext), '/v', 'MultiSelectModel', '/d', 'Player']   // shown for more than 15 files too
    ])
  ];
  for (const [key, ...rest] of steps) if (reg('add', key, ...rest, '/f').status !== 0) return false;
  return true;
}
function unregisterClassic(classes = CLASSES) { for (const ext of EXTS) reg('delete', verbKey(classes, ext), '/f'); reg('delete', clsidKey(classes), '/f'); }
// every type: a 1.0.x install registered only .pdf
function classicRegistered(classes = CLASSES) { return EXTS.every(ext => reg('query', verbKey(classes, ext), '/v', 'ExplorerCommandHandler').status === 0); }
```

Exports: add `EXTS` after `TASKS`:
```js
module.exports = {
  CLSID, PKG, PKG_VERSION, TASKS, EXTS, parseTaskArgs, readTaskList, registerClassic, unregisterClassic, classicRegistered,
  readState, writeState, clearState, windowsBuild, oldDir, cleanOld, release, runCommand, packageWorks
};
```

- [ ] **Step 4: Run it until it passes**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && node unit-test.js
```
Expected: `ALL PASS` (the `electron . --explorer-menu=install → exit 2` check needs ELECTRON_RUN_AS_NODE removed — the test does that itself).

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add explorer-menu.js && git commit -m "feat: Explorer menu list files and classic keys take pictures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Combine / Make PDF with pictures in the main window

**Files:**
- Modify: `app/index.html` (`combinePaths`, ~line 1036)
- Test: `<S>\t\menu-test-combine.js` (run through `menu-test.js combine`)

**Interfaces:**
- Consumes: `SastraImages.kind`, `SastraImages.addImagePage` (Task 1); `readTaskList` passing pictures (Task 2);
  `desk.readFile(path) → { name, data } | { name, error }`; `openBytes(bytes, name, { dirty }) → d | null`.

- [ ] **Step 1: Change `<S>\t\menu-test-combine.js`**

Add after the `require`s:
```js
const P = require('./pictures.js');
```
Replace the last block (from `await click('combine', [path.join(C, 'Test 01.pdf'), path.join(C, 'bad.pdf')]);` to the end
of the function) with:

```js
  const toastText = () => main.evaluate(() => document.querySelector('.toast')?.textContent || '');
  const lastTab = async () => (await tabs()).at(-1) || '';
  // one good + one damaged: the good one still goes in, the damaged one is named (2026-10-17: one readable file is enough)
  let n = (await tabs()).length;
  await click('combine', [path.join(C, 'Test 01.pdf'), path.join(C, 'bad.pdf')]);
  await until(async () => (await tabs()).length === n + 1);
  check('one good + one damaged → tab "Combined.pdf", toast names the damaged file',
    /Combined\.pdf/.test(await lastTab()) && /Combined 1 file · 3 pages\. Couldn't read: bad\.pdf/.test(await toastText()), await toastText());

  // pictures and PDFs together: name order, each picture its own size, damaged files skipped and named
  const D = path.join(OUT, 'mix'); fs.mkdirSync(D, { recursive: true });
  const put = (name, bytes) => fs.writeFileSync(path.join(D, name), bytes);
  put('01 photo.jpg', P.jpegWith(await P.canvasPicture(main, 'image/jpeg', 200, 100), P.app1({ orientation: 6 })));
  put('02 alpha.png', P.pngWith(await P.canvasPicture(main, 'image/png', 300, 150, { alphaLeft: true }), P.phys(11811)));
  put('03 paint.bmp', P.bmp(300, 150, P.quad(300, 150), 5906));
  put('04 anim.gif', P.gif(120, 90, [[0, 255, 0], [255, 0, 0]], () => 0, () => 1));
  put('05 web.webp', await P.canvasPicture(main, 'image/webp', 160, 120));
  put('06 broken.png', Buffer.from('not a picture'));
  await makePdf(path.join(D, '07 doc.pdf'), 2, 500, 700);
  await makePdf(path.join(D, '10 doc.pdf'), 1, 520, 700);
  n = (await tabs()).length;
  await click('combine', ['10 doc.pdf', '03 paint.bmp', '06 broken.png', '01 photo.jpg', '07 doc.pdf', '05 web.webp', '02 alpha.png', '04 anim.gif'].map(f => path.join(D, f)));
  await until(async () => (await tabs()).length === n + 1);
  check('pictures + PDFs → one new tab "Combined.pdf", unsaved', /Combined\.pdf/.test(await lastTab()) && await main.evaluate(() => document.title.startsWith('•')), await lastTab());
  check('toast: "Combined 7 files · 8 pages. Couldn\'t read: 06 broken.png"', /^Combined 7 files · 8 pages\. Couldn't read: 06 broken\.png$/.test(await toastText()), await toastText());
  const to2 = path.join(D, 'saved.pdf');
  await app.evaluate((_e, to) => { globalThis.__dlg.saveTo = to; globalThis.__dlg.saves = []; }, to2);
  await main.keyboard.press('Control+Shift+S');
  await until(() => fs.existsSync(to2));
  if (fs.existsSync(to2)) {
    const doc = await PDFDocument.load(fs.readFileSync(to2));
    const sizes = doc.getPages().map(p => `${+p.getWidth().toFixed(2)}x${+p.getHeight().toFixed(2)}`).join(' ');
    check('pages in name order, each picture its own size', sizes === '75x150 72x36 143.99x72 90x67.5 120x90 500x700 500x700 520x700', sizes);
    const drawn = await main.evaluate(async file => {
      const label = ([r, g, b]) => r > 200 && g > 200 && b > 200 ? 'white' : r > 150 && g > 150 ? 'yellow' : r > 150 ? 'red' : g > 150 ? 'green' : b > 150 ? 'blue' : 'other';
      const f = await window.sastra.readFile(file), O = window.SastraOps;
      const d = await (await O.pdfjs()).getDocument({ data: new Uint8Array(f.data), ...O.PDFJS_OPTS }).promise, out = [];
      for (const i of [0, 1]) {
        const bm = await createImageBitmap((await O.renderPage(d, i, 144, 'image/png')).blob);
        const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0);
        out.push([[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([fx, fy]) => label(x.getImageData(Math.floor(fx * bm.width), Math.floor(fy * bm.height), 1, 1).data)).join());
      }
      await O.closePdf(d); return out;
    }, to2);
    check('phone photo (EXIF 6) stands upright: blue, red / yellow, green', drawn[0] === 'blue,red,yellow,green', drawn[0]);
    check('transparent half of the PNG is white', drawn[1] === 'white,green,white,yellow', drawn[1]);
  }

  // one picture → "Make PDF": tab named after it (a PNG named .jpg: the type comes from the content; Khmer name)
  put('រូបថត.jpg', await P.canvasPicture(main, 'image/png', 80, 40));
  n = (await tabs()).length;
  await click('combine', [path.join(D, 'រូបថត.jpg')]);
  await until(async () => (await tabs()).length === n + 1);
  check('one picture → tab "រូបថត.pdf", 1 page, unsaved', /រូបថត\.pdf/.test(await lastTab()) && await main.evaluate(() => document.querySelector('#pageOf').textContent.trim() === '/ 1' && document.title.startsWith('•')), await lastTab());
  check('toast "Made រូបថត.pdf · 1 page"', (await toastText()) === 'Made រូបថត.pdf · 1 page', await toastText());

  // nothing readable → error toast naming both, no tab
  n = (await tabs()).length;
  await click('combine', [path.join(D, '06 broken.png'), path.join(C, 'bad.pdf')]);
  await until(async () => /No PDF made/.test(await toastText()), 15000);
  check('nothing readable → "No PDF made. Couldn\'t read: …" (error), no new tab',
    (await toastText()) === "No PDF made. Couldn't read: 06 broken.png, bad.pdf" && (await tabs()).length === n && await main.evaluate(() => document.querySelector('.toast').classList.contains('err')), await toastText());
};
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && unset ELECTRON_RUN_AS_NODE && node menu-test.js combine
```
Expected: the 4 first checks PASS (old combine), then FAIL from `one good + one damaged → tab "Combined.pdf"` on
(the old code refuses fewer than 2 PDFs and treats pictures as damaged PDFs).

- [ ] **Step 3: Replace `combinePaths` in `app/index.html`**

```js
// Combine / Make PDF from the File Explorer menu (main.js sends the paths in name order): PDFs and pictures
// (app/images.js) become one new unsaved tab — "<name>.pdf" for one file, else "Combined.pdf". Files that can't be
// read are skipped and named; one readable file is enough.
async function combinePaths(paths){
  while (state.busy) await new Promise(r => setTimeout(r, 200));
  const one = paths.length === 1, name = one ? paths[0].split(/[\\/]/).pop().replace(/\.[^.]*$/, '') + '.pdf' : 'Combined.pdf';
  await busy(one ? `Making ${name}…` : `Combining ${paths.length} files…`, async () => {
    const out = await PDFDocument.create(), bad = []; let used = 0;
    for (const p of paths) {
      const f = await desk.readFile(p);
      if (f.error) { bad.push(f.name); continue; }
      const bytes = new Uint8Array(f.data);
      try {
        if (SastraImages.kind(bytes) === 'pdf') {
          const src = await PDFDocument.load(bytes, { ignoreEncryption:true });
          if (src.isEncrypted) { bad.push(f.name); continue; }
          (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
        } else await SastraImages.addImagePage(out, bytes);
        used++;
      } catch { bad.push(f.name); }
    }
    const skipped = bad.length ? `. Couldn't read: ${bad.join(', ')}` : '';
    if (!used) { toast(`No PDF made${skipped}`, true); return; }
    const d = await openBytes(await out.save(), name, { dirty:true });
    if (!d) return;
    d.saveDir = paths[0].replace(/[\\/][^\\/]*$/, '');
    const pages = `${d.n} page${d.n > 1 ? 's' : ''}`;
    toast(one ? `Made ${name} · ${pages}${skipped}` : `Combined ${used} file${used > 1 ? 's' : ''} · ${pages}${skipped}`, !!bad.length);
  });
}
```

- [ ] **Step 4: Run it until it passes**

```bash
cd /c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t && unset ELECTRON_RUN_AS_NODE && node menu-test.js combine
```
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html && git commit -m "feat: Combine / Make PDF from the Explorer menu takes pictures

One file makes <name>.pdf; one readable file is enough; unreadable files are
skipped and named.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The menu DLL, its package manifest and the build check

**Files:**
- Modify: `explorer-menu/menu.cpp`, `explorer-menu/AppxManifest.xml`, `scripts/build-explorer-menu.js`, `explorer-menu.js` (`PKG_VERSION`)
- Test: `<S>\t\harness\menu-harness.cpp`, `<S>\t\harness\make-files.js`, `<S>\t\unit-test.js`

**Interfaces:**
- Consumes: `EXTS`, `PKG_VERSION`, `CLSID`, `PKG` from explorer-menu.js (Task 2).
- Produces: sub-commands in this order (8): Make PDF, Combine, separator, Split here, Split to…, separator, Images here,
  Images to…. Make PDF and Combine start `--sastra-task=combine` with all PDFs + pictures (selection order); Split/Images
  send only the PDFs.

- [ ] **Step 1: Extend the harness**

`<S>\t\harness\make-files.js` — the file list becomes:
```js
for (const n of ['Report.pdf', 'Test 01.pdf', 'Test 02.pdf', 'Test 10.pdf', 'notes.txt',
  'ឯកសាររបាយការណ៍ប្រចាំឆ្នាំ២០២៦ផ្នែកហិរញ្ញវត្ថុនិងរដ្ឋបាល.pdf',
  'photo.jpg', 'PHOTO2.JPG', 'e.jpeg', 'd.jfif', 'scan.png', 'a.bmp', 'b.gif', 'c.webp', 'f.tif', 'g.heic', 'រូបថត.jpg']) fs.writeFileSync(path.join(dir, n), '%PDF-1.4\n');
```

`<S>\t\harness\menu-harness.cpp` — in `wmain`, replace everything from `auto rows1 = Rows(root.Get(), one.Get());` to the
line before `wprintf(fails ? …` with:

```cpp
  // sub-commands: 0 Make PDF, 1 Combine, 2 —, 3 Split here, 4 Split to…, 5 —, 6 Images here, 7 Images to…
  auto rows1 = Rows(root.Get(), one.Get());
  check(L"8 sub-commands", rows1.size() == 8, std::to_wstring(rows1.size()));
  const std::wstring onePdf = L"Split here|Split to \"Report\\\"|—|Images here (JPG)|Images to \"Report\\\" (JPG)";
  check(L"one PDF: no Make PDF, no Combine", Visible(rows1) == onePdf, Visible(rows1));

  auto three = Sel(dir, { L"Test 02.pdf", L"Test 10.pdf", L"Test 01.pdf" });
  auto rows3 = Rows(root.Get(), three.Get());
  check(L"three PDFs", Visible(rows3) == L"Combine 3 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)", Visible(rows3));

  auto mixed = Sel(dir, { L"Report.pdf", L"notes.txt" });
  check(L"PDF + text file: counts only the PDF", Visible(Rows(root.Get(), mixed.Get())) == onePdf);
  auto none = Sel(dir, { L"notes.txt" });
  rs = ECS_ENABLED; root->GetState(none.Get(), TRUE, &rs); check(L"nothing usable: root hidden", rs == ECS_HIDDEN);

  const std::wstring kname = L"ឯកសាររបាយការណ៍ប្រចាំឆ្នាំ២០២៦ផ្នែកហិរញ្ញវត្ថុនិងរដ្ឋបាល";
  auto km = Sel(dir, { kname + L".pdf" });
  auto rowsK = Rows(root.Get(), km.Get());
  check(L"long Khmer name cut to 32 + …", rowsK.size() == 8 && rowsK[4].title == L"Split to \"" + kname.substr(0, 32) + L"…\\\"", rowsK.size() == 8 ? rowsK[4].title : L"");

  // pictures (2026-10-17)
  for (const wchar_t* n : { L"photo.jpg", L"PHOTO2.JPG", L"e.jpeg", L"d.jfif", L"scan.png", L"a.bmp", L"b.gif", L"c.webp", L"រូបថត.jpg" }) {
    auto s = Sel(dir, { n }); EXPCMDSTATE st = ECS_HIDDEN; root->GetState(s.Get(), TRUE, &st);
    std::wstring v = Visible(Rows(root.Get(), s.Get()));
    check(std::wstring(L"one picture ") + n + L": root shown, only Make PDF", st == ECS_ENABLED && v == L"Make PDF", v);
  }
  for (const wchar_t* n : { L"f.tif", L"g.heic" }) {
    auto s = Sel(dir, { n }); EXPCMDSTATE st = ECS_ENABLED; root->GetState(s.Get(), TRUE, &st);
    check(std::wstring(L"not supported ") + n + L": root hidden", st == ECS_HIDDEN);
  }
  auto pics = Sel(dir, { L"photo.jpg", L"scan.png" });
  check(L"two pictures: only Combine 2 files", Visible(Rows(root.Get(), pics.Get())) == L"Combine 2 files", Visible(Rows(root.Get(), pics.Get())));
  auto picPdf = Sel(dir, { L"photo.jpg", L"Report.pdf" });
  auto rowsM = Rows(root.Get(), picPdf.Get());
  check(L"picture + PDF: Combine 2 + Split/Images for the PDF", Visible(rowsM) == L"Combine 2 files|—|" + onePdf, Visible(rowsM));
  auto picTxt = Sel(dir, { L"photo.jpg", L"notes.txt" });
  check(L"picture + text file: Make PDF", Visible(Rows(root.Get(), picTxt.Get())) == L"Make PDF");
  auto many = Sel(dir, { L"photo.jpg", L"Test 01.pdf", L"Test 02.pdf", L"scan.png", L"notes.txt" });
  check(L"2 pictures + 2 PDFs + text: Combine 4 files, Split to folders", Visible(Rows(root.Get(), many.Get())) == L"Combine 4 files|—|Split here|Split to folders|—|Images here (JPG)|Images to folders (JPG)", Visible(Rows(root.Get(), many.Get())));

  // clicks: SASTRA_MENU_EXE = the stub, which writes its command line to SASTRA_STUB_OUT
  std::wstring out = dir + L"\\stub-out.txt";
  SetEnvironmentVariableW(L"SASTRA_MENU_EXE", stub.c_str()); SetEnvironmentVariableW(L"SASTRA_STUB_OUT", out.c_str());
  std::wstring cl = InvokeAndRead(rows3[1].cmd.Get(), three.Get(), out);
  check(L"Combine starts the app with --sastra-task=combine", cl.find(L"--sastra-task=combine") != std::wstring::npos, cl);
  std::wstring list = ListOf(cl);
  wchar_t tmp[MAX_PATH + 1]; GetTempPathW(MAX_PATH + 1, tmp);
  check(L"list file in %TEMP%\\Sastra PDF\\menu-*.txt", list.rfind(std::wstring(tmp) + L"Sastra PDF\\menu-", 0) == 0 && list.size() > 4 && list.substr(list.size() - 4) == L".txt", list);
  check(L"list = the 3 paths, UTF-8, one per line", FromUtf8(ReadAll(list)) == dir + L"\\Test 02.pdf\n" + dir + L"\\Test 10.pdf\n" + dir + L"\\Test 01.pdf\n");
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rowsK[7].cmd.Get(), km.Get(), out);
  check(L"Images to folder → --sastra-task=images-folder", cl.find(L"--sastra-task=images-folder") != std::wstring::npos, cl);
  list = ListOf(cl);
  check(L"Khmer path survives the list file", FromUtf8(ReadAll(list)) == dir + L"\\" + kname + L".pdf\n");
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rows1[3].cmd.Get(), one.Get(), out);
  check(L"Split here → --sastra-task=split-here", cl.find(L"--sastra-task=split-here") != std::wstring::npos, cl);
  DeleteFileW(ListOf(cl).c_str());

  auto kpic = Sel(dir, { L"រូបថត.jpg" });
  cl = InvokeAndRead(Rows(root.Get(), kpic.Get())[0].cmd.Get(), kpic.Get(), out);
  list = ListOf(cl);
  check(L"Make PDF → --sastra-task=combine with the one picture (Khmer name)", cl.find(L"--sastra-task=combine") != std::wstring::npos && FromUtf8(ReadAll(list)) == dir + L"\\រូបថត.jpg\n", cl);
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rowsM[1].cmd.Get(), picPdf.Get(), out);
  list = ListOf(cl);
  check(L"Combine picture + PDF → both, in selection order", cl.find(L"--sastra-task=combine") != std::wstring::npos && FromUtf8(ReadAll(list)) == dir + L"\\photo.jpg\n" + dir + L"\\Report.pdf\n", FromUtf8(ReadAll(list)));
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rowsM[3].cmd.Get(), picPdf.Get(), out);
  list = ListOf(cl);
  check(L"Split here on picture + PDF → only the PDF", cl.find(L"--sastra-task=split-here") != std::wstring::npos && FromUtf8(ReadAll(list)) == dir + L"\\Report.pdf\n", FromUtf8(ReadAll(list)));
  DeleteFileW(list.c_str());
  cl = InvokeAndRead(rowsM[6].cmd.Get(), picPdf.Get(), out);
  list = ListOf(cl);
  check(L"Images here on picture + PDF → only the PDF", cl.find(L"--sastra-task=images-here") != std::wstring::npos && FromUtf8(ReadAll(list)) == dir + L"\\Report.pdf\n", FromUtf8(ReadAll(list)));
  DeleteFileW(list.c_str());

```

In `<S>\t\unit-test.js`, after the `EXTS` check add:
```js
check('menu package version 1.1.0.0', m.PKG_VERSION === '1.1.0.0', m.PKG_VERSION);
```

- [ ] **Step 2: Build the current DLL and the harness; run them to see the new checks fail**

```bash
cd /e/_httdocs/SastraPDF && npm run build:menu
H=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t/harness
cmd //c "$(cygpath -w $H)\\build.bat" && node $H/make-files.js
"$H/menu-harness.exe" "E:\\_httdocs\\SastraPDF\\explorer-menu\\out\\SastraMenu.dll" "$(cygpath -w $H)\\files" "$(cygpath -w $H)\\stub.exe"
```
Expected: `HARNESS-BUILT`, `files ready`, then FAIL on `8 sub-commands` and the picture checks.
(`vcvars` may print "'vswhere.exe' is not recognized" — harmless.)

- [ ] **Step 3: Bump the package version and make the build script check the file types**

`explorer-menu.js`: `const PKG_VERSION = '1.1.0.0';        // = explorer-menu/AppxManifest.xml (the build script checks)`

`scripts/build-explorer-menu.js` — replace the block from `// CLSID and package version must be the same …` to the
`if (!xml.includes(\`Name="${PKG}"\`) …` line with:

```js
// CLSID, package version and file types must be the same in the DLL, the manifest and explorer-menu.js
const { CLSID, PKG, PKG_VERSION, EXTS } = require('../explorer-menu.js');
const cpp = fs.readFileSync(path.join(SRC, 'menu.cpp'), 'utf8'), xml = fs.readFileSync(path.join(SRC, 'AppxManifest.xml'), 'utf8');
const id = CLSID.slice(1, -1).toLowerCase();
if (!cpp.toLowerCase().includes(`uuid("${id}")`)) fail(`menu.cpp does not use ${CLSID}`);
const types = [...xml.matchAll(/<desktop5:ItemType Type="([^"]+)">\s*<desktop5:Verb Id="SastraPDF" Clsid="([^"]+)" \/>/g)];
if (types.map(t => t[1]).join(' ') !== EXTS.join(' ') || types.some(t => t[2].toLowerCase() !== id))
  fail(`AppxManifest.xml needs one ItemType per file type (${EXTS.join(' ')}), each with ${CLSID}`);
if (!xml.toLowerCase().includes(`<com:class id="${id}"`)) fail(`AppxManifest.xml's COM class must be ${CLSID}`);
for (const e of EXTS) if (!cpp.includes(`L"${e}"`)) fail(`menu.cpp does not handle ${e}`);
if (!xml.includes(`Name="${PKG}"`) || !xml.includes(`Version="${PKG_VERSION}"`)) fail(`AppxManifest.xml must be ${PKG} ${PKG_VERSION}`);
```

Run: `cd /e/_httdocs/SastraPDF && npm run build:menu`
Expected: `build-explorer-menu: AppxManifest.xml needs one ItemType per file type (.pdf .jpg .jpeg .jfif .png .bmp .gif .webp), each with {47a2af3d-…}` and exit 1.

- [ ] **Step 4: The manifest**

`explorer-menu/AppxManifest.xml`:
- Comment, last line → `Keep Version, the CLSID and the file types in step with explorer-menu.js and menu.cpp (scripts/build-explorer-menu.js checks). -->`
- `Version="1.0.0.0"` → `Version="1.1.0.0"`
- `Description="Sastra PDF right-click menu for PDF files"` → `Description="Sastra PDF right-click menu for PDF files and pictures"`
- The `<desktop4:FileExplorerContextMenus>` content becomes:

```xml
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type=".pdf">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jpg">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jpeg">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jfif">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".png">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".bmp">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".gif">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".webp">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
```

- [ ] **Step 5: The DLL** — `explorer-menu/menu.cpp`

Header comment:
```cpp
// Sastra PDF — File Explorer right-click menu: "Sastra PDF ▸ Make PDF / Combine / Split / Images" for PDFs and pictures.
// An IExplorerCommand with sub-commands. Windows 11 loads it through the SastraPDF.ExplorerMenu package
// (first menu, in a dllhost); Windows 10 and the fallback through HKCU\Software\Classes (classic menu, in
// explorer.exe). A click writes the chosen files to a list file and starts Sastra PDF with
// --sastra-task / --sastra-list (main.js + explorer-menu.js read them).
```

`enum class Act { MakePdf, Combine, Sep1, SplitHere, SplitFolder, Sep2, ImagesHere, ImagesFolder };`

Replace `PdfPaths` with:
```cpp
// The PDFs and pictures in the selection (by extension, any case); anything else (folders, other files, virtual items)
// is ignored. Same types as EXTS in explorer-menu.js and the manifest (the build script checks).
static const wchar_t* const PICTURES[] = { L".jpg", L".jpeg", L".jfif", L".png", L".bmp", L".gif", L".webp" };
struct Selection { std::vector<std::wstring> all, pdfs; };   // all = PDFs + pictures, in selection order
static Selection Scan(IShellItemArray* items) {
  Selection s; DWORD n = 0;
  if (!items || FAILED(items->GetCount(&n))) return s;
  for (DWORD i = 0; i < n; i++) {
    ComPtr<IShellItem> it; if (FAILED(items->GetItemAt(i, &it))) continue;
    LPWSTR p = nullptr;
    if (SUCCEEDED(it->GetDisplayName(SIGDN_FILESYSPATH, &p)) && p) {
      const wchar_t* ext = PathFindExtensionW(p);
      bool pdf = lstrcmpiW(ext, L".pdf") == 0, picture = false;
      for (auto e : PICTURES) picture = picture || lstrcmpiW(ext, e) == 0;
      if (pdf || picture) s.all.emplace_back(p);
      if (pdf) s.pdfs.emplace_back(p);
      CoTaskMemFree(p);
    }
  }
  return s;
}
```

Replace `Title` and add `Shown`:
```cpp
static std::wstring Title(Act a, const Selection& s) {
  const bool one = s.pdfs.size() == 1;
  switch (a) {
    case Act::MakePdf: return L"Make PDF";
    case Act::Combine: return L"Combine " + std::to_wstring(s.all.size()) + L" files";
    case Act::SplitHere: return L"Split here";
    case Act::SplitFolder: return one ? L"Split to \"" + ShortBase(s.pdfs[0]) + L"\\\"" : L"Split to folders";
    case Act::ImagesHere: return L"Images here (JPG)";
    case Act::ImagesFolder: return one ? L"Images to \"" + ShortBase(s.pdfs[0]) + L"\\\" (JPG)" : L"Images to folders (JPG)";
    default: return L"";
  }
}

// Make PDF: exactly one picture. Combine: 2+ files of any kind. Split / Images (and the lines around them): the PDFs only.
static bool Shown(Act a, const Selection& s) {
  switch (a) {
    case Act::MakePdf: return s.all.size() == 1 && s.pdfs.empty();
    case Act::Combine: return s.all.size() >= 2;
    case Act::Sep1: return s.all.size() >= 2 && !s.pdfs.empty();
    default: return !s.pdfs.empty();
  }
}
```

`TaskName`: add `case Act::MakePdf:` above `case Act::Combine: return L"combine";` (both start a combine).

`Launch(Act a, const std::vector<std::wstring>& pdfs)` → rename the parameter to `paths` (body: `pdfs` → `paths`).

In `class Item`:
```cpp
  IFACEMETHODIMP GetTitle(IShellItemArray* items, LPWSTR* name) override {
    *name = nullptr; return SHStrDupW(Separator() ? L"" : Title(act_, Scan(items)).c_str(), name);
  }
  …
  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    *state = Shown(act_, Scan(items)) ? ECS_ENABLED : ECS_HIDDEN; return S_OK;
  }
  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
    if (Separator()) return S_OK;
    Selection s = Scan(items);
    return Launch(act_, act_ == Act::MakePdf || act_ == Act::Combine ? s.all : s.pdfs);   // Split / Images: the PDFs only
  }
```

`Enum()`: `for (Act a : { Act::MakePdf, Act::Combine, Act::Sep1, Act::SplitHere, Act::SplitFolder, Act::Sep2, Act::ImagesHere, Act::ImagesFolder })`

`Root::GetState`: `*state = Scan(items).all.empty() ? ECS_HIDDEN : ECS_ENABLED; return S_OK;`

- [ ] **Step 6: Build and run the harness and the unit test until they pass**

```bash
cd /e/_httdocs/SastraPDF && npm run build:menu
S=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t; H=$S/harness
"$H/menu-harness.exe" "E:\\_httdocs\\SastraPDF\\explorer-menu\\out\\SastraMenu.dll" "$(cygpath -w $H)\\files" "$(cygpath -w $H)\\stub.exe"
cd $S && node unit-test.js
```
Expected: `build-explorer-menu: explorer-menu\out\SastraMenu.dll and SastraPDF.ExplorerMenu.msix ready`, harness
`ALL PASS`, unit test `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add explorer-menu/menu.cpp explorer-menu/AppxManifest.xml scripts/build-explorer-menu.js explorer-menu.js && git commit -m "feat: Explorer menu for pictures: Make PDF, Combine any mix

Menu package 1.1.0.0 (installing the update asks for admin once). The build
script checks the file types match in menu.cpp, the manifest and
explorer-menu.js.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Everything still works, from source and packaged; docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/HISTORY.md`

- [ ] **Step 1: All tests from source**

```bash
S=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t
cd $S && unset ELECTRON_RUN_AS_NODE && rm -rf ud
for t in images-test.js "menu-test.js all" unit-test.js ops-test.js nozip-test.js print-test.js close-test.js titlebar-test.js; do echo "== $t"; node $t 2>&1 | tail -3; done
```
Expected: each ends with `ALL PASS` (the earlier counts: menu 43 + the new combine checks, folder 23, print 71, close 12,
titlebar 43, ops 10). A failure in an old test: run it alone, read the failing line, fix the cause (superpowers:systematic-debugging).

- [ ] **Step 2: The packaged app (no installer, no version change)**

```bash
cd /e/_httdocs/SastraPDF && npm run build:menu && npx electron-builder --win --dir
S=/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t
cd $S && unset ELECTRON_RUN_AS_NODE && rm -rf ud
for t in images-test.js "menu-test.js all" ops-test.js nozip-test.js print-test.js close-test.js titlebar-test.js; do echo "== $t"; PACKED=1 node $t 2>&1 | tail -3; done
ls "/e/_httdocs/SastraPDF/dist/win-unpacked/resources/app.asar" && npx --yes @electron/asar list "/e/_httdocs/SastraPDF/dist/win-unpacked/resources/app.asar" | grep images.js
```
Expected: `ALL PASS` for each; `\app\images.js` is inside app.asar. (If `win-unpacked.tmp` EPERM: delete it and run again.)

- [ ] **Step 3: Docs**

`CLAUDE.md`:
- Project layout, after the `app/pdfops.js` entry:
```
    app/images.js      `window.SastraImages` (main window only): pictures → PDF pages for the Explorer menu's
                       Make PDF / Combine. Type from the content; JPEG as it is (EXIF orientation applied by the
                       drawing matrix), PNG lossless, BMP/GIF/WebP via createImageBitmap → PNG; page = the picture's
                       own size (dpi from JFIF/EXIF/pHYs/BMP header, else 96; max 14 400 pt a side)
```
- `explorer-menu/` line: `File Explorer right-click menu for PDFs and pictures: …`
- "Explorer menu" paragraph: `Right-click PDFs →` becomes `Right-click PDFs and/or pictures (.jpg .jpeg .jfif .png .bmp .gif .webp —
  EXTS in explorer-menu.js = manifest ItemTypes = menu.cpp's list, the build script checks) → Sastra PDF ▸ Make PDF (1 picture) /
  Combine N files (2+ files, any mix) / Split here / … (Split and Images only for the PDFs in the selection)`; Combine and Make
  PDF → `combinePaths`: one unsaved tab, `<name>.pdf` for one file else `Combined.pdf`, unreadable files skipped and named,
  one readable file is enough. Menu package 1.1.0.0 since 2026-10-17 (the update asks UAC once).
- Status: a `**Pictures in the Explorer menu (2026-10-17, branch feat/explorer-images)**` entry with the test counts from Steps 1–2.

`README.md`: the right-click feature bullet becomes
```
- Right-click PDFs or pictures (JPG, PNG, BMP, GIF, WebP) in File Explorer → **Sastra PDF**: Make PDF from one
  picture, Combine the selected files (PDFs and pictures together, in name order), Split (one file per page, here
  or into a folder named after the PDF), Images (JPG, 300 dpi, here or into a folder).
```
(the next two lines about Windows 11 / Windows 10 stay), and in Project layout after `app/pdfops.js`:
`    app/images.js      Turns pictures into PDF pages (Make PDF / Combine from the Explorer menu)`.

`docs/HISTORY.md`: new section at the end:
```
### 31. Pictures in the Explorer menu (Claude Code, 2026-10-17)
The user asked for pictures in the right-click menu, to put scans and phone photos into a PDF. Decisions (asked one
at a time): pictures and PDFs combine together in name order; each picture page is the picture's own size (no A4
fitting); one picture → "Make PDF"; the result opens as an unsaved tab; JPG, PNG, BMP, GIF and WebP (HEIC and TIFF
were asked for, then dropped as rare). JPEG goes in without re-compression, phone-photo rotation (EXIF) is applied.
The menu package version went to 1.1.0.0, so the update asks for admin once. New logo and .pdf file icon on the same branch.
Built from a written spec and plan with tests first: C++ harness, Node unit test, Playwright (every EXIF orientation
drawn by pdf.js and compared with how Chromium shows the photo).
```

- [ ] **Step 4: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add CLAUDE.md README.md docs/HISTORY.md docs/superpowers/plans/2026-10-17-explorer-images.md && git commit -m "docs: pictures in the Explorer menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: With the user — version, installer, the real menu

Needs the user; ask, don't assume.

- [ ] **Step 1: Ask** (AskUserQuestion): the release version (suggest 1.1.0 — a new feature; 1.0.4 was never released) and
  whether to build the installer and install it over their copy now (they close their Sastra PDF; Windows asks "Yes" once).
- [ ] **Step 2: Build** — `npm version <X> --no-git-tag-version`, `npm run dist`, re-run `PACKED=1` menu-test and images-test
  on the new `dist\win-unpacked`, commit `package.json`/`package-lock.json` ("chore: version <X>").
- [ ] **Step 3: Install with the user** — they close Sastra PDF; start `dist\Sastra PDF Setup <X>.exe` (normal, not silent);
  they click through and answer UAC "Yes". Check `%TEMP%\Sastra PDF\explorer-menu.log` says `install: package added`.
- [ ] **Step 4: The user checks the real menu**: right-click 1 picture → Make PDF; pictures + PDFs → Combine N files;
  in the same mixed selection right-click once on a picture and once on a PDF (both must show Combine with the full count);
  "Show more options" once. If the mixed selection shows the menu only for one kind, report it (a possible fix is
  `ItemType Type="*"` with the DLL hiding the root — that needs the user's OK, it is not in the spec).
- [ ] **Step 5: Report** in plain words; ask before merging to main, pushing or releasing.

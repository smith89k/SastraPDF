# Drop files into the Pages panel, and move pages between open files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDFs and pictures dragged from File Explorer onto the Pages panel go in at a red line (one undo), and thumbnails dragged onto another file's tab move (or, with Ctrl, copy) those pages into that file.

**Architecture:** Everything lives in app/index.html, plus one optional argument in app/images.js. One function, `insertItems(d, at, items)`, adds PDFs and pictures to a file at an index in one `commit`; Insert file and the panel drop both use it. The per-thumbnail `dragover`/`drop` listeners are replaced by two listeners on the panel (`#thumbs`) that find the red line from the mouse height (`dropSpot`) and take both file drops and page drags. Tabs get `dragover`/`drop` listeners for page drags: a 500 ms hover opens the tab; `transferPages` copies the pages into the target and removes them from the source, each file its own undo step.

**Tech Stack:** Electron 44 page (classic script in app/index.html, no build step), pdf-lib 1.17.1 (`PDFLib` global), pdf.js 6.4.299, playwright-core (from the old test folder) for tests.

**Spec:** docs/superpowers/specs/2026-10-19-drop-into-pages-design.md

## Global Constraints

- Picture types: `.jpg .jpeg .jfif .png .bmp .gif .webp` (the right-click menu's list), told apart by content with `SastraImages.kind`, never by name.
- Pictures go in at **their own size** (as Make PDF): `SastraImages.addImagePage`, dpi from the file, else 96, EXIF orientation applied.
- Several files: name order like File Explorer — `new Intl.Collator(undefined, { numeric:true, sensitivity:'base' }).compare` (`2.jpg` before `10.png`).
- One drop = one `commit` = one Ctrl+Z. A move between files = one undo step in each file. Nothing is saved to disk.
- Toasts: `Inserted N pages after page K` / `Inserted N pages at the start` (singular `1 page`); `Moved 3 pages to B.pdf` / `Copied 3 pages to B.pdf`; every page of the source dragged → `Copied 5 pages to B.pdf — A.pdf keeps them: a PDF needs at least one page`. Unusable files: one error toast that names them.
- Hovering another file's tab during a page drag opens it after `TAB_HOVER_MS = 500`. The source file's own tab does nothing.
- A drag carrying files (`dataTransfer.types` has `Files`) is ALWAYS a file drop, whatever `dragFrom` says; a page drag never carries files. This is what keeps a stale `dragFrom` harmless.
- Dropping files on the page area, on the tab row, or with no PDF open works as today (PDFs open in new tabs).
- No Windows message boxes; no new libraries; the app sends nothing anywhere.
- Tests live outside the repo in `T = C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\1b403cbd-775e-405a-a501-2aab4d3fe529\scratchpad\t` (this session's scratchpad). Older suites are in `OLD = C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t`. Every launch deletes `ELECTRON_RUN_AS_NODE` from the environment.
- Work on main; one commit per task; never push without asking the user.

## Review Focus

1. **A file drop right after a page drag that never got its `dragend`** (the dragged thumbnail was removed when the other tab opened) → inserts the files, never moves pages. Pinned in Task 4 (check "stale page drag").
2. **Move fails half-way** → the target edit is saved in memory only after both new files are made, so a failure leaves both files as they were. Pinned in Task 4 by code order (both `save()` calls before either `commit`).
3. **Every page of the source dragged** → copied, source keeps them, toast says why. Pinned in Task 4.
4. **Same-file reorder still works** after the per-thumbnail listeners move to the panel. Pinned in Task 3.
5. **No PDF open / drop on the page area / drop on the tab row** → still opens new tabs. Pinned in Task 3.

---

### Task 1: Test setup, and `addImagePage` can insert at an index

**Files:**
- Modify: `app/images.js:105-121` (`addImagePage`)
- Create (outside the repo): `$T\drop-test.js`, `$T\package.json`, `$T\node_modules\` (copied), `$T\notes-skip.js`, `$T\pictures.js`, `$T\pdfs\locked.pdf`

**Interfaces:**
- Produces: `SastraImages.addImagePage(doc, bytes, at?) → Promise<{ width, height }>` — with `at` (0-based) the page goes in at that index (`doc.insertPage`), without it at the end as today.
- Produces (test): `$T\drop-test.js` with helpers `ev`, `check`, `until`, `idle`, `quit`, `undo`, `ars`, `st`, `clickTab`, `dropAt`, `dragStart`, `overTab`, `dropOnTab`, `fileArg`, `launch(files)`, a `GROUPS` object and a runner; `TASKS=1,2,3,4` picks groups.

- [ ] **Step 1: Set up the test folder**

```bash
T="/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/1b403cbd-775e-405a-a501-2aab4d3fe529/scratchpad/t"
OLD="/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t"
mkdir -p "$T/pdfs" && cp -r "$OLD/package.json" "$OLD/node_modules" "$OLD/notes-skip.js" "$OLD/pictures.js" "$T/" && cp "$OLD/pdfs/locked.pdf" "$T/pdfs/"
ls "$T" "$T/pdfs"
```

Expected: `node_modules notes-skip.js package.json pdfs pictures.js` and `locked.pdf`.

- [ ] **Step 2: Write the test file with group 1 (failing)** — `$T\drop-test.js`:

```js
// Drop PDFs / pictures into the Pages panel, and move pages between open files (spec 2026-10-19-drop-into-pages).
// TASKS=1,2,3,4 picks groups (default all). PACKED=1: dist\win-unpacked.
const { _electron } = require('playwright-core');
const fs = require('fs'), path = require('path');
const P = require('./pictures');
const { PDFDocument } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
const UD = path.join(T, 'ud-drop'), D = path.join(T, 'drop');
const TASKS = (process.env.TASKS || '1,2,3,4').split(',').map(Number);
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch {} await sleep(120); } return false; };
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const r4 = x => Math.round(x * 1e4) / 1e4;
// A.pdf page i is (101 + i) × 200 pt, B.pdf page j is (201 + j) × 300, c.pdf is 150 × 100 then 100 × 100: every page
// tells by its shape (width / height, the thumbnail's --ar) which file and page it came from.
const A = [0, 1, 2, 3, 4].map(i => r4((101 + i) / 200)), B = [0, 1, 2].map(j => r4((201 + j) / 300));
const JPG = .5, PNG = 2, C = [1.5, 1];   // 2.jpg: 200 × 100 turned by EXIF 6 → 75 × 150 pt; 10.png: 40 × 20 → 30 × 15 pt
const errors = []; let S = null;   // S = { app, page }

async function makePdf(file, sizes){ const doc = await PDFDocument.create(); for (const s of sizes) doc.addPage(s); fs.writeFileSync(file, await doc.save()); }
async function launch(files){
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + UD, ...files], env });
  const page = await app.firstWindow();
  await require('./notes-skip')(page);   // fresh profile: What's new opens once
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  S = { app, page };
  if (files.length) await until(() => page.evaluate(n => document.querySelectorAll('#tabstrip .tab').length === n && document.querySelectorAll('#thumbs .tbox canvas').length > 0, files.length), 20000);
  else await until(() => page.evaluate(() => !!document.querySelector('#thumbs .thumb.ghost')), 20000);
  await sleep(500);
}
// the files are changed and unsaved, so the app would ask before closing: give it 5 s, then end the process
const quit = async () => { await Promise.race([S.app.close().catch(() => {}), sleep(5000)]); try { S.app.process().kill(); } catch {} await sleep(500); };
const ev = (f, a) => S.page.evaluate(f, a);
const idle = async () => { await until(() => ev(() => !document.querySelector('#stBusy').textContent), 15000); await sleep(250); };
// the open file's pages as shapes (width / height), in order
const ars = () => ev(() => [...document.querySelectorAll('#thumbs .thumb:not(.ghost) .tbox')].map(b => Math.round(+b.style.getPropertyValue('--ar') * 1e4) / 1e4));
const st = () => ev(() => { const t = document.querySelector('.toast');
  return { tabs: [...document.querySelectorAll('#tabstrip .tab')].map(x => ({ name: x.title, active: x.classList.contains('active'), dirty: !!x.querySelector('.dot') })),
    active: document.querySelector('#tabstrip .tab.active')?.title || '', sel: [...document.querySelectorAll('#thumbs .thumb.sel')].map(x => +x.dataset.i),
    cur: +(document.querySelector('#thumbs .thumb.current')?.dataset.i ?? -1), toast: t && t.style.opacity === '1' ? t.textContent : '', err: !!t?.classList.contains('err') }; });
const clickTab = async name => { await ev(n => [...document.querySelectorAll('#tabstrip .tab')].find(x => x.title === n).click(), name); await idle(); };
const undo = async () => { await ev(() => document.querySelector('#bUndo').click()); await idle(); };
const fileArg = names => names.map(n => ({ name: n, data: [...fs.readFileSync(path.join(D, n))] }));
// Drags over the Pages panel (or `on`) and drops at thumbnail i's height × f (f < 0: above it, > 1: below it; i null:
// the panel's middle). files: [{ name, data }] as File Explorer would bring them; null: the page drag from dragStart.
// → what showed while dragging: the red line, the panel's drop mode, the drop effect, the page area's dashed box.
const dropAt = (i, f, files, { on = '#thumbs', ctrl = false } = {}) => ev(([i, f, files, on, ctrl]) => {
  let dt = window.__pageDrag;
  if (files) { dt = new DataTransfer(); for (const x of files) dt.items.add(new File([new Uint8Array(x.data)], x.name)); }
  const panel = document.querySelector('#thumbs'), pr = panel.getBoundingClientRect(), el = document.querySelector(on);
  const r = i === null ? pr : panel.querySelector(`.thumb[data-i="${i}"]`).getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, dataTransfer: dt, ctrlKey: ctrl, clientX: on === '#thumbs' ? pr.left + pr.width / 2 : el.getBoundingClientRect().left + 40, clientY: r.top + r.height * f };
  el.dispatchEvent(new DragEvent('dragenter', o)); el.dispatchEvent(new DragEvent('dragover', o));
  const l = panel.querySelector('.drop-before,.drop-after'), box = getComputedStyle(document.querySelector('#viewer'), '::after');
  const seen = { line: l ? (l.classList.contains('drop-before') ? 'before ' : 'after ') + l.dataset.i : '', pagesMode: document.querySelector('#app').classList.contains('dropping-pages'),
    effect: dt.dropEffect, box: box.display === 'none' ? 'hidden' : box.content };
  el.dispatchEvent(new DragEvent('drop', o));
  return seen;
}, [i, f, files, on, ctrl]);
// Starts dragging thumbnail i (it joins the selection, as a mouse press on it would) → effectAllowed
const dragStart = i => ev(i => { window.__pageDrag = new DataTransfer(); document.querySelector(`#thumbs .thumb[data-i="${i}"]`).dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__pageDrag })); return window.__pageDrag.effectAllowed; }, i);
const tabEvent = (name, type, ctrl = false) => ev(([n, type, ctrl]) => { const t = [...document.querySelectorAll('#tabstrip .tab')].find(x => x.title === n), r = t.getBoundingClientRect();
  t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: window.__pageDrag, ctrlKey: ctrl, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  return t.classList.contains('drop-on'); }, [name, type, ctrl]);
const overTab = async name => { await tabEvent(name, 'dragenter'); return tabEvent(name, 'dragover'); };   // → is the tab highlighted
const dropOnTab = (name, ctrl) => tabEvent(name, 'drop', ctrl);

const GROUPS = {};
// ---- group 1: addImagePage(doc, bytes, at) ----
GROUPS[1] = async () => {
  const sizes = await ev(async () => {
    const c = new OffscreenCanvas(40, 20); c.getContext('2d').fillRect(0, 0, 40, 20);
    const png = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const doc = await PDFLib.PDFDocument.create(); doc.addPage([100, 100]); doc.addPage([200, 200]);
    await SastraImages.addImagePage(doc, png, 1); await SastraImages.addImagePage(doc, png, 0); await SastraImages.addImagePage(doc, png);
    return doc.getPages().map(p => { const s = p.getSize(); return [Math.round(s.width), Math.round(s.height)]; });
  });
  check('addImagePage: at 1, at 0, then no index = last', JSON.stringify(sizes) === JSON.stringify([[30, 15], [100, 100], [30, 15], [200, 200], [30, 15]]), sizes);
};
// ---- runner ----
(async () => {
  fs.rmSync(UD, { recursive: true, force: true }); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D);
  await makePdf(path.join(D, 'A.pdf'), [0, 1, 2, 3, 4].map(i => [101 + i, 200]));
  await makePdf(path.join(D, 'B.pdf'), [0, 1, 2].map(j => [201 + j, 300]));
  await makePdf(path.join(D, 'c.pdf'), [[150, 100], [100, 100]]);
  fs.copyFileSync(path.join(T, 'pdfs', 'locked.pdf'), path.join(D, 'locked.pdf'));
  fs.writeFileSync(path.join(D, 'notes.txt'), 'not a picture');
  await launch([path.join(D, 'A.pdf'), path.join(D, 'B.pdf')]);
  fs.writeFileSync(path.join(D, '2.jpg'), P.jpegWith(await P.canvasPicture(S.page, 'image/jpeg', 200, 100), P.app1({ orientation: 6 })));
  fs.writeFileSync(path.join(D, '10.png'), await P.canvasPicture(S.page, 'image/png', 40, 20));
  for (const k of TASKS) if (GROUPS[k]) { console.log(`\n-- group ${k}`); await GROUPS[k](); }
  check('no console errors', errors.length === 0, errors.join(' | '));
  await quit();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```

- [ ] **Step 3: Run it — it fails**

Run (Git Bash): `cd "$T" && TASKS=1 node drop-test.js`
Expected: `FAIL  addImagePage: at 1, at 0, then no index = last` (today every picture goes last: `[[100,100],[200,200],[30,15],[30,15],[30,15]]`).

- [ ] **Step 4: Implement** — in `app/images.js`, replace the comment and function `addImagePage` (lines 105–119) with:

```js
  // Adds the picture as a page of a pdf-lib document — at index `at` when given, else last → { width, height } in
  // points. Rejects (adding nothing) when the bytes are not a picture it can read.
  async function addImagePage(doc, bytes, at) {
    const k = kind(bytes); let img, dpi = null, orientation = 1;
    if (k === 'jpeg') { ({ orientation, dpi } = jpegInfo(bytes)); img = await doc.embedJpg(bytes); }
    else if (k === 'png') { dpi = pngDpi(bytes); img = await doc.embedPng(bytes); }
    else if (k === 'bmp' || k === 'gif' || k === 'webp') { if (k === 'bmp') dpi = bmpDpi(bytes); img = await doc.embedPng(await toPng(bytes, k)); }
    else throw new Error('not a supported picture');
    if (!(img.width > 0 && img.height > 0)) throw new Error('the picture has no size');
    const { width, height } = pageSize(img.width, img.height, dpi, orientation);
    const page = at === undefined ? doc.addPage([width, height]) : doc.insertPage(at, [width, height]);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placement(orientation, width, height)),
      drawObject(page.node.newXObject('Image', img.ref)), popGraphicsState());
    return { width, height };
  }
```

Also change line 1–2 of the file header from `pictures → PDF pages, for "Make PDF" / "Combine" from the File Explorer menu.` to `pictures → PDF pages, for "Make PDF" / "Combine" from the File Explorer menu and for pictures dropped into the Pages panel.`

- [ ] **Step 5: Run it — it passes**

Run: `cd "$T" && TASKS=1 node drop-test.js`
Expected: `PASS  addImagePage: …`, `PASS  no console errors`, `ALL PASS`.
Also run the old pictures suite (images.js changed): `cd "$OLD" && node images-test.js` → `ALL PASS` (61 checks).

- [ ] **Step 6: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/images.js && git commit -m "feat(images): addImagePage can put the picture at a page index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `insertItems` — PDFs and pictures into a file at an index; Insert file takes pictures

**Files:**
- Modify: `app/index.html:551` (`#fInsert` accept), `app/index.html:1349-1364` (`insertFiles` → `fileItems` + `insertItems` + `insertFiles`)
- Test: `$T\drop-test.js` (group 2)

**Interfaces:**
- Consumes: `SastraImages.addImagePage(doc, bytes, at)` (Task 1), `SastraImages.kind(bytes)`, `commit`, `busy`, `goTo`, `toast`, `active` (existing).
- Produces (page-internal):
  - `fileItems(files: FileList | File[]) → Promise<{ name: string, bytes: Uint8Array | null }[]>` (`null` = couldn't be read)
  - `insertItems(d, at: number, items: { name, bytes }[]) → Promise<void>` — one `commit`, new pages selected, first one current and shown; toast as in Global Constraints.
  - `byName(a: string, b: string) → number` (Explorer's name order)

- [ ] **Step 1: Add group 2 to the test (failing)** — insert before the line `// ---- runner ----`:

```js
// ---- group 2: Insert file (Organize pages) takes pictures, name order, one undo ----
GROUPS[2] = async () => {
  await clickTab('A.pdf');
  check('Insert file offers pictures', await ev(() => ['.pdf', '.jpg', '.jpeg', '.jfif', '.png', '.bmp', '.gif', '.webp'].every(x => document.querySelector('#fInsert').accept.split(',').includes(x))));
  await S.page.click('#thumbs .thumb[data-i="1"]'); await sleep(300);
  await S.page.setInputFiles('#fInsert', ['c.pdf', '10.png', '2.jpg'].map(n => path.join(D, n))); await idle();
  const s = await st(), a = await ars();
  check('after the current page (2), in name order: 2.jpg, 10.png, c.pdf', JSON.stringify(a) === JSON.stringify([A[0], A[1], JPG, PNG, ...C, A[2], A[3], A[4]]), a);
  check('new pages selected, the first is current', JSON.stringify(s.sel) === '[2,3,4,5]' && s.cur === 2, s);
  check('toast: Inserted 4 pages after page 2', s.toast === 'Inserted 4 pages after page 2', s.toast);
  await undo();
  check('one Ctrl+Z takes it all back', JSON.stringify(await ars()) === JSON.stringify(A), await ars());
  await S.page.setInputFiles('#fInsert', [path.join(D, 'notes.txt')]); await idle();
  const s2 = await st();
  check('a .txt is skipped: nothing changes, an error toast names it', (await ars()).length === 5 && s2.err && s2.toast.includes('notes.txt'), s2.toast);
};
```

- [ ] **Step 2: Run it — it fails**

Run: `cd "$T" && TASKS=2 node drop-test.js`
Expected: `FAIL  Insert file offers pictures`, `FAIL  after the current page …` (pictures are filtered out today).

- [ ] **Step 3: Implement**

In `app/index.html` line 551 replace the input with:

```html
<input type="file" id="fInsert" accept=".pdf,.jpg,.jpeg,.jfif,.png,.bmp,.gif,.webp" multiple hidden>
```

Replace the whole `async function insertFiles(files){ … }` (lines 1349–1364) with:

```js
// Files as { name, bytes } (bytes null: the file couldn't be read) — for insertItems
const fileItems = files => Promise.all([...files].map(async f => ({ name: f.name, bytes: await f.arrayBuffer().then(b => new Uint8Array(b), () => null) })));
const byName = new Intl.Collator(undefined, { numeric:true, sensitivity:'base' }).compare;   // as File Explorer: 2 before 10
// PDFs and pictures (app/images.js: the picture's own size) → pages of d from index `at`, in name order, as ONE edit
// (one Ctrl+Z). Insert file and files dropped on the Pages panel. Files that can't be used (password-protected,
// damaged, not a PDF or picture) are skipped and named in one toast; none usable → nothing changes.
async function insertItems(d, at, items){
  const list = [...items].sort((a,b) => byName(a.name, b.name));
  await busy('Inserting pages…', async () => {
    const doc = await PDFDocument.load(d.bytes, { ignoreEncryption:true });
    const skipped = []; let k = at;
    for (const it of list) {
      try {
        if (SastraImages.kind(it.bytes) === 'pdf') {
          const src = await PDFDocument.load(it.bytes, { ignoreEncryption:true });
          if (src.isEncrypted) { skipped.push(it.name); continue; }
          (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.insertPage(k++, p));
        } else { await SastraImages.addImagePage(doc, it.bytes, k); k++; }
      } catch { skipped.push(it.name); }   // bytes null, damaged, or not a PDF or picture
    }
    const n = k - at, bad = skipped.length ? `Couldn't add ${skipped.join(', ')}: not a PDF or picture, damaged, or password-protected` : '';
    if (!n) { if (bad) toast(bad, true); return; }
    const sel = []; for (let i = at; i < k; i++) sel.push(i);
    await commit(d, await doc.save(), { sel, current:at });
    if (active() === d) goTo(at);
    const done = `Inserted ${n} page${n>1?'s':''} ${at ? 'after page ' + at : 'at the start'}`;
    toast(bad ? `${done} · ${bad}` : done, !!bad);
  });
}
// Insert file (Organize pages): after the current page
async function insertFiles(files){
  const d = active(); if (!d) return;
  const items = await fileItems(files); if (items.length) await insertItems(d, d.current + 1, items);
}
```

- [ ] **Step 4: Run it — it passes**

Run: `cd "$T" && TASKS=1,2 node drop-test.js`
Expected: every line `PASS`, `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html && git commit -m "feat: Insert file takes pictures too, in name order, as one undo step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Files dropped on the Pages panel go in at the red line

**Files:**
- Modify: `app/index.html` CSS after line 180 (`.dropping .viewer::after`); `renderThumbs` (lines 1261–1276: the thumbnail's `dragstart`/`dragend`/`dragover`/`drop` listeners); after line 1281 (`clearDrop`): new `dropSpot`, `endPageDrag`, panel listeners; `updateUI` (line ~1538): `hasdoc` class; lines 1672–1678 (window drop handlers)
- Test: `$T\drop-test.js` (group 3)

**Interfaces:**
- Consumes: `fileItems`, `insertItems` (Task 2), `movePages(ins)` (existing), `hasFiles(e)` (existing, line 1674).
- Produces (page-internal):
  - `dropSpot(y: number) → { at: number, el: Element, cls: 'drop-before'|'drop-after' } | null` — the red line for a mouse height (before the first thumbnail whose middle is below `y`, else after the last; null with no thumbnails)
  - `endPageDrag()` — forgets the page drag (`dragFrom = null`), removes the red line and the `.dragging` look
  - `endDropping()` — the file-drag look off (`dragDepth = 0`, `#app` loses `dropping` and `dropping-pages`)
  - `#app` classes `hasdoc` (a PDF is open) and `dropping-pages` (files are over the Pages panel)
  - `dragFrom` keeps its shape `{ docId }` here; Task 4 adds `pages`.

- [ ] **Step 1: Add group 3 to the test (failing)** — insert before `// ---- runner ----`:

```js
// ---- group 3: files dropped on the Pages panel ----
GROUPS[3] = async () => {
  await clickTab('A.pdf');
  const n0 = (await st()).tabs.length;
  let seen = await dropAt(2, .25, fileArg(['c.pdf', '10.png', '2.jpg'])); await idle();
  let s = await st(), a = await ars();
  check('red line before page 3 while dragging; panel mode on; page-area box hidden', seen.line === 'before 2' && seen.pagesMode && seen.box === 'hidden', seen);
  check('dropped before page 3, name order', JSON.stringify(a) === JSON.stringify([A[0], A[1], JPG, PNG, ...C, A[2], A[3], A[4]]), a);
  check('selected + current + toast; no new tab', JSON.stringify(s.sel) === '[2,3,4,5]' && s.cur === 2 && s.toast === 'Inserted 4 pages after page 2' && s.tabs.length === n0, s);
  await undo();
  check('one Ctrl+Z takes the drop back', JSON.stringify(await ars()) === JSON.stringify(A), await ars());

  seen = await dropAt(2, .75, fileArg(['10.png'])); await idle();
  check('lower half of page 3 → after it', seen.line === 'after 2' && JSON.stringify(await ars()) === JSON.stringify([A[0], A[1], A[2], PNG, A[3], A[4]]), { seen, a: await ars() });
  await undo();
  seen = await dropAt(0, -.1, fileArg(['10.png'])); await idle();
  s = await st();
  check('above the first → at the start', seen.line === 'before 0' && JSON.stringify(await ars()) === JSON.stringify([PNG, ...A]) && s.toast === 'Inserted 1 page at the start', { seen, toast: s.toast });
  await undo();
  seen = await dropAt(4, 1.4, fileArg(['10.png'])); await idle();
  s = await st();
  check('below the last → at the end', seen.line === 'after 4' && JSON.stringify(await ars()) === JSON.stringify([...A, PNG]) && s.toast === 'Inserted 1 page after page 5', { seen, toast: s.toast });
  await undo();

  await dropAt(1, .25, fileArg(['locked.pdf', 'notes.txt', '10.png'])); await idle();
  s = await st();
  check('password PDF and .txt skipped, the picture added, one error toast names both', (await ars()).length === 6 && s.err && s.toast.includes('locked.pdf') && s.toast.includes('notes.txt') && s.toast.startsWith('Inserted 1 page'), s.toast);
  await undo();
  await dropAt(1, .25, fileArg(['notes.txt'])); await idle();
  s = await st();
  check('nothing usable → no change, error toast', (await ars()).length === 5 && s.err && s.toast.includes('notes.txt'), s.toast);

  // same-file reorder still works (the panel took over the thumbnails' drop listeners)
  await S.page.click('#thumbs .thumb[data-i="0"]'); await sleep(200);
  await dragStart(0); seen = await dropAt(3, .75, null); await idle();
  check('dragging page 1 below page 4 still reorders', seen.line === 'after 3' && JSON.stringify(await ars()) === JSON.stringify([A[1], A[2], A[3], A[0], A[4]]), { seen, a: await ars() });
  await undo();

  // elsewhere: as today
  seen = await dropAt(null, .5, fileArg(['c.pdf']), { on: '#viewer' }); await idle();
  await until(async () => (await st()).tabs.length === n0 + 1, 8000);
  s = await st();
  check('drop on the page area opens a tab; its box mentions the Pages panel', s.tabs.length === n0 + 1 && s.active === 'c.pdf' && !seen.pagesMode && /Pages panel/.test(seen.box), { seen, tabs: s.tabs });
  await ev(() => document.querySelector('#tabstrip .tab.active .x').click()); await idle();
  await clickTab('A.pdf');
  check('A.pdf untouched by that', JSON.stringify(await ars()) === JSON.stringify(A));

  // no PDF open: a drop on the Pages panel opens tabs
  await quit(); await launch([]);
  seen = await dropAt(null, .5, fileArg(['c.pdf'])); await idle();
  await until(async () => (await st()).tabs.length === 1, 8000);
  s = await st();
  check('no PDF open: drop on the panel opens a tab', s.tabs.length === 1 && s.active === 'c.pdf' && !seen.pagesMode, { seen, s });
  await quit(); await launch([path.join(D, 'A.pdf'), path.join(D, 'B.pdf')]);
};
```

- [ ] **Step 2: Run it — it fails**

Run: `cd "$T" && TASKS=3 node drop-test.js`
Expected: `FAIL  red line before page 3 …` (no line for files today) and `FAIL  dropped before page 3 …` (the drop opens a tab instead).

- [ ] **Step 3: Implement — CSS.** After line 180 (`.dropping .viewer::after{…}`) add:

```css
.dropping.hasdoc .viewer::after{content:"Drop PDFs to open them in new tabs, or drop on the Pages panel to add them"}
.dropping.dropping-pages .viewer::after{display:none}
```

- [ ] **Step 4: Implement — thumbnail listeners.** In `renderThumbs`, replace the four listeners `dragstart`, `dragend`, `dragover`, `drop` (lines 1261–1276) with only:

```js
    t.addEventListener('dragstart', e => {
      if (!d.sel.has(i)) { d.sel = new Set([i]); d.anchor = i; updateSel(); }
      dragFrom = { docId:d.id }; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','folio-pages');
      requestAnimationFrame(() => thumbsEl.querySelectorAll('.thumb.sel').forEach(x=>x.classList.add('dragging')));
    });
    t.addEventListener('dragend', endPageDrag);   // may never come when the thumbnail is gone: see the window's dragend
```

- [ ] **Step 5: Implement — the panel takes the drop.** Replace line 1281 (`const clearDrop = …`) with:

```js
const clearDrop = () => thumbsEl.querySelectorAll('.drop-before,.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
// The red line for a mouse height: before the first thumbnail whose middle is below it, else after the last
function dropSpot(y){
  const ts = [...thumbsEl.querySelectorAll('.thumb:not(.ghost)')]; if (!ts.length) return null;
  for (const t of ts) { const r = t.getBoundingClientRect(); if (y < r.top + r.height/2) return { at:+t.dataset.i, el:t, cls:'drop-before' }; }
  const t = ts[ts.length-1]; return { at:+t.dataset.i + 1, el:t, cls:'drop-after' };
}
function endPageDrag(){ dragFrom = null; clearDrop(); thumbsEl.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging')); }
// The Pages panel takes dragged thumbnails (move) and files from File Explorer (insert at the red line). A drag that
// carries files is always a file drop, even if a page drag never got its dragend. No PDF open: the window opens tabs.
thumbsEl.addEventListener('dragover', e => {
  const d = active(), files = hasFiles(e); if (!d || !(files || dragFrom)) return;
  const spot = dropSpot(e.clientY); if (!spot) return;
  e.preventDefault(); e.dataTransfer.dropEffect = files ? 'copy' : 'move';
  if (!spot.el.classList.contains(spot.cls)) { clearDrop(); spot.el.classList.add(spot.cls); }
});
thumbsEl.addEventListener('drop', e => {
  const d = active(), files = hasFiles(e); if (!d || !(files || dragFrom)) return;
  e.preventDefault(); e.stopPropagation();   // never the window's drop: no new tabs
  const spot = dropSpot(e.clientY), from = dragFrom;
  endPageDrag(); endDropping(); if (!spot) return;
  if (files) fileItems(e.dataTransfer.files).then(items => insertItems(d, spot.at, items));
  else if (from.docId === d.id) movePages(spot.at);
});
```

- [ ] **Step 6: Implement — `hasdoc`.** In `updateUI`, right after the line `const d = active(), has = !!d, b = state.busy;` add:

```js
  app.classList.toggle('hasdoc', has);   // the page area's drop box mentions the Pages panel
```

- [ ] **Step 7: Implement — window handlers.** Replace lines 1672–1678 (`/* drop files anywhere */` … the `drop` listener) with:

```js
/* drop files anywhere: PDFs open in new tabs (the Pages panel takes its own drops) */
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types||[])].includes('Files');
function endDropping(){ dragDepth = 0; app.classList.remove('dropping','dropping-pages'); }
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; app.classList.add('dropping'); });
window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0,dragDepth-1); if (!dragDepth) { endDropping(); clearDrop(); } });
window.addEventListener('dragover', e => {
  const inPages = !!e.target.closest?.('#thumbs');
  if (!inPages) clearDrop();   // the red line only while over the panel
  if (hasFiles(e)) { e.preventDefault(); app.classList.toggle('dropping-pages', inPages && !!active()); }
});
window.addEventListener('drop', e => { endPageDrag(); if (!hasFiles(e)) return; e.preventDefault(); endDropping(); openFiles(e.dataTransfer.files); });
window.addEventListener('dragend', endPageDrag, true);   // a dragged thumbnail still in the page
```

- [ ] **Step 8: Run it — it passes**

Run: `cd "$T" && TASKS=1,2,3 node drop-test.js`
Expected: every line `PASS`, `ALL PASS`.

- [ ] **Step 9: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html && git commit -m "feat: drop PDFs and pictures on the Pages panel to add them at the red line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Move pages to another open file through its tab (Ctrl = copy)

**Files:**
- Modify: `app/index.html` CSS after line 120 (`.tab.active::before`); `renderTabs` (after line 1066, the tab's `keydown` listener); `renderThumbs` `dragstart` (from Task 3); the panel's `dragover`/`drop` and `endPageDrag` (from Task 3); after `movePages` (line ~1322): new `transferPages`
- Test: `$T\drop-test.js` (group 4)

**Interfaces:**
- Consumes: `dropSpot`, `endPageDrag`, panel listeners (Task 3); `commit`, `busy`, `activate`, `renderTabs`, `goTo`, `toast` (existing).
- Produces (page-internal):
  - `dragFrom = { docId: number, pages: number[] }` (0-based, sorted; the selection at `dragstart`)
  - `TAB_HOVER_MS = 500`; `tabHover = { el, timer } | null`; `cancelTabHover()`
  - `transferPages(from: { docId, pages }, d, at: number, copy: boolean) → Promise<void>`

- [ ] **Step 1: Add group 4 to the test (failing)** — insert before `// ---- runner ----`:

```js
// ---- group 4: pages to another open file through its tab ----
GROUPS[4] = async () => {
  await clickTab('A.pdf');
  await S.page.click('#thumbs .thumb[data-i="1"]'); await S.page.click('#thumbs .thumb[data-i="3"]', { modifiers: ['Control'] }); await sleep(200);
  check('the drag allows copy and move', await dragStart(1) === 'copyMove');
  check('B.pdf\'s tab lights up under the drag', await overTab('B.pdf'));
  await sleep(200);
  check('…not opened before half a second', (await st()).active === 'A.pdf');
  await until(async () => (await st()).active === 'B.pdf', 1500);
  check('…opened after half a second', (await st()).active === 'B.pdf');
  let seen = await dropAt(1, .25, null); await idle();
  let s = await st();
  check('red line in B.pdf, drop effect move', seen.line === 'before 1' && seen.effect === 'move', seen);
  check('B.pdf has A\'s pages 2 and 4 before its page 2', JSON.stringify(await ars()) === JSON.stringify([B[0], A[1], A[3], B[1], B[2]]), await ars());
  check('they are selected, B.pdf stays open, toast "Moved 2 pages to B.pdf"', JSON.stringify(s.sel) === '[1,2]' && s.active === 'B.pdf' && s.toast === 'Moved 2 pages to B.pdf', s);
  check('both files marked changed', s.tabs.every(t => t.dirty), s.tabs);
  await clickTab('A.pdf');
  check('A.pdf lost them', JSON.stringify(await ars()) === JSON.stringify([A[0], A[2], A[4]]), await ars());
  await undo();
  check('Ctrl+Z in A.pdf brings them back', JSON.stringify(await ars()) === JSON.stringify(A), await ars());
  await clickTab('B.pdf'); await undo();
  check('Ctrl+Z in B.pdf takes them out', JSON.stringify(await ars()) === JSON.stringify(B), await ars());

  await clickTab('A.pdf'); await S.page.click('#thumbs .thumb[data-i="0"]'); await sleep(200);
  await dragStart(0); await overTab('B.pdf'); await until(async () => (await st()).active === 'B.pdf', 1500);
  seen = await dropAt(2, .75, null, { ctrl: true }); await idle();
  s = await st();
  check('Ctrl at the drop copies (+ cursor)', seen.effect === 'copy' && JSON.stringify(await ars()) === JSON.stringify([...B, A[0]]) && s.toast === 'Copied 1 page to B.pdf', { seen, toast: s.toast });
  await undo(); await clickTab('A.pdf');
  check('…and A.pdf keeps its page', JSON.stringify(await ars()) === JSON.stringify(A));

  await S.page.click('#thumbs .thumb[data-i="4"]'); await sleep(200);
  await dragStart(4); await dropOnTab('B.pdf'); await idle();
  s = await st();
  check('dropped on the tab itself → at the end of B.pdf, which opens', s.active === 'B.pdf' && JSON.stringify(await ars()) === JSON.stringify([...B, A[4]]), { s, a: await ars() });
  await undo(); await clickTab('A.pdf'); await undo();
  check('both undone', JSON.stringify(await ars()) === JSON.stringify(A));

  await ev(() => document.querySelector('#viewer').focus()); await S.page.keyboard.press('Control+a'); await sleep(200);
  await dragStart(0); await dropOnTab('B.pdf'); await idle();
  s = await st();
  check('every page of A.pdf → copied, toast says why', JSON.stringify(await ars()) === JSON.stringify([...B, ...A]) && s.toast === 'Copied 5 pages to B.pdf — A.pdf keeps them: a PDF needs at least one page', s.toast);
  await undo(); await clickTab('A.pdf');
  check('A.pdf still has all 5', JSON.stringify(await ars()) === JSON.stringify(A));

  await S.page.click('#thumbs .thumb[data-i="0"]'); await sleep(200);
  await dragStart(0); await overTab('B.pdf'); await sleep(200);
  await ev(() => { const v = document.querySelector('#viewer'), r = v.getBoundingClientRect(); v.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__pageDrag, clientX: r.left + 50, clientY: r.top + 50 })); });
  await sleep(600);
  s = await st();
  check('a short hover, then away: B.pdf not opened, no highlight', s.active === 'A.pdf' && !(await ev(() => !!document.querySelector('#tabstrip .tab.drop-on'))), s.active);
  check('own tab: no highlight, nothing happens', !(await overTab('A.pdf')));
  await dropOnTab('A.pdf'); await sleep(400);
  check('…dropping on it changes nothing', JSON.stringify(await ars()) === JSON.stringify(A));

  await dragStart(0);   // a page drag that never ends (its thumbnail vanished)…
  await dropAt(1, .25, fileArg(['10.png'])); await idle();
  check('stale page drag: a file drop still inserts the file', JSON.stringify(await ars()) === JSON.stringify([A[0], PNG, ...A.slice(1)]), await ars());
  await undo();
};
```

- [ ] **Step 2: Run it — it fails**

Run: `cd "$T" && TASKS=4 node drop-test.js`
Expected: `FAIL  the drag allows copy and move` (today `move`), `FAIL  B.pdf's tab lights up …`.

- [ ] **Step 3: Implement — CSS.** After line 120 (`.tab.active::before{…}`) add:

```css
.tab.drop-on{background:var(--accent-soft);border-color:var(--accent);color:var(--fg)}
```

- [ ] **Step 4: Implement — the drag remembers its pages.** In `renderThumbs` `dragstart` (Task 3, Step 4) replace the line `dragFrom = { docId:d.id }; e.dataTransfer.effectAllowed='move'; …` with:

```js
      dragFrom = { docId:d.id, pages:[...d.sel].sort((a,b)=>a-b) }; e.dataTransfer.effectAllowed='copyMove'; e.dataTransfer.setData('text/plain','folio-pages');
```

- [ ] **Step 5: Implement — tabs take page drags.** In `renderTabs`, after the line `t.addEventListener('keydown', e => { if (e.key==='Enter') activate(d.id); });` add:

```js
    // pages dragged from another file: the tab lights up, opens after TAB_HOVER_MS; a drop on it adds them at the end
    t.addEventListener('dragover', e => {
      if (hasFiles(e) || !dragFrom || d.id === dragFrom.docId) return;
      e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      if (tabHover?.el === t) return;
      cancelTabHover(); t.classList.add('drop-on');
      tabHover = { el:t, timer: d.id === state.activeId ? null : setTimeout(() => { cancelTabHover(); if (dragFrom) activate(d.id); }, TAB_HOVER_MS) };
    });
    t.addEventListener('drop', e => {
      if (hasFiles(e) || !dragFrom || d.id === dragFrom.docId) return;
      e.preventDefault(); e.stopPropagation();
      const from = dragFrom; endPageDrag(); transferPages(from, d, d.n, e.ctrlKey);
    });
```

And just above `function renderTabs(){` add:

```js
const TAB_HOVER_MS = 500;
let tabHover = null;   // { el, timer }: a page drag resting on another file's tab
function cancelTabHover(){ if (!tabHover) return; clearTimeout(tabHover.timer); tabHover.el.classList.remove('drop-on'); tabHover = null; }
```

- [ ] **Step 6: Implement — the panel and the window know about tabs.** Change `endPageDrag` (Task 3, Step 5) to:

```js
function endPageDrag(){ dragFrom = null; cancelTabHover(); clearDrop(); thumbsEl.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging')); }
```

In the panel's `dragover` listener replace `e.preventDefault(); e.dataTransfer.dropEffect = files ? 'copy' : 'move';` with:

```js
  e.preventDefault(); e.dataTransfer.dropEffect = files || (dragFrom.docId !== d.id && e.ctrlKey) ? 'copy' : 'move';
```

In the panel's `drop` listener replace `else if (from.docId === d.id) movePages(spot.at);` with:

```js
  else if (from.docId === d.id) movePages(spot.at);
  else transferPages(from, d, spot.at, e.ctrlKey);
```

In the window `dragover` listener (Task 3, Step 7), after `if (!inPages) clearDrop();` add:

```js
  if (tabHover && e.target.closest?.('.tab') !== tabHover.el) cancelTabHover();   // left the tab before it opened
```

- [ ] **Step 7: Implement — `transferPages`.** After the closing `}` of `async function movePages(ins){ … }` add:

```js
// Pages dragged from another open file: copied into d at `at`, then (no Ctrl) removed from the source — each file its
// own undo step, nothing saved. Both new files are made before either changes, so a failure leaves both as they were.
// Every page of the source → copied instead: a PDF needs at least one page.
async function transferPages(from, d, at, copy){
  const s = state.docs.find(x => x.id === from.docId); if (!s || s === d) return;
  const pages = from.pages.filter(i => i < s.n); if (!pages.length) return;
  const all = !copy && pages.length >= s.n; if (all) copy = true;
  const n = pages.length, what = `${n} page${n>1?'s':''}`;
  await busy(copy ? 'Copying pages…' : 'Moving pages…', async () => {
    const src = await PDFDocument.load(s.bytes, { ignoreEncryption:true }), doc = await PDFDocument.load(d.bytes, { ignoreEncryption:true });
    let k = at; (await doc.copyPages(src, pages)).forEach(p => doc.insertPage(k++, p));
    const target = await doc.save();
    let rest = null; if (!copy) { [...pages].reverse().forEach(i => src.removePage(i)); rest = await src.save(); }
    await commit(d, target, { sel:pages.map((_, j) => at + j), current:at });
    if (rest) await commit(s, rest, { sel:[], current:Math.min(pages[0], s.n - n - 1) });
    if (active() !== d) activate(d.id); else renderTabs();   // the source's tab shows its change dot too
    goTo(at);
    toast(all ? `Copied ${what} to ${d.name} — ${s.name} keeps them: a PDF needs at least one page` : `${copy ? 'Copied' : 'Moved'} ${what} to ${d.name}`);
  });
}
```

- [ ] **Step 8: Run it — it passes**

Run: `cd "$T" && node drop-test.js`
Expected: every line `PASS` in groups 1–4, `ALL PASS`.

- [ ] **Step 9: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html && git commit -m "feat: drag pages onto another file's tab to move them there (Ctrl = copy)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The other suites, a real drag by hand, and the docs

**Files:**
- Modify: `CLAUDE.md` (section "How app/index.html works"), `docs/HISTORY.md` (new section 34 at the end)

- [ ] **Step 1: Run the suites that touch the Pages panel, dropping and closing** (from source; each must end `ALL PASS`):

```bash
OLD="/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t"
cd "$OLD" && cp pdfs/ten.pdf out/ten.pdf && for s in controls-test pages-panel-test titlebar-test close-test images-test; do echo "== $s"; node $s.js | tail -3; done
```

A one-off "page count dropped / dirty" failure while someone types in another window is a stray key (see CLAUDE.md gotchas): re-run that suite once.

- [ ] **Step 2: Real drags, by hand, with the user.** Start the app (`run.bat`), open two PDFs, and ask the user to try, from File Explorer: a PDF and two photos onto the Pages panel between two pages (red line shows; photos the right way up); the same onto the page area (opens tabs); then thumbnails onto the other tab (opens after half a second; move; Ctrl = copy). Write down what they report.

- [ ] **Step 3: Update CLAUDE.md.** In "How app/index.html works", after the bullet that starts `- Pages panel width (since 2026-10-17` add:

```markdown
- Drop into the Pages panel (since 2026-10-19; spec/plan docs/superpowers/*/2026-10-19-drop-into-pages*): the panel
  (`#thumbs`) owns `dragover`/`drop` for both dragged thumbnails and files; `dropSpot(y)` puts the red line before the
  first thumbnail whose middle is below the mouse, else after the last. Files (PDFs + the menu's picture types, by content)
  → `fileItems` → `insertItems(d, at, items)`: name order (`byName`, as Explorer), pictures at their own size
  (`addImagePage(doc, bytes, at)`), ONE commit, unusable files named in one error toast. Insert file uses it too (after
  the current page). Over the panel `#app.dropping-pages` hides the page area's "Drop PDFs…" box; elsewhere and with no
  PDF open files still open as tabs. A drag carrying files is ALWAYS a file drop (a page drag never carries files), so a
  stale `dragFrom` can't turn it into a page move. Page drags: `dragFrom = { docId, pages }`, `copyMove`; another file's
  tab lights up (`.tab.drop-on`) and opens after `TAB_HOVER_MS` 500 (`tabHover`, cancelled by the window's dragover when
  the mouse leaves it); drop at the line or on the tab (= at the end) → `transferPages`: copy into the target, then remove
  from the source (both new files made first), one undo step in each; Ctrl = copy; every page → copied with a toast
  saying why. `endPageDrag` runs on every drop and on a `dragend` caught at the window. Test: drop-test.js (groups 1–4).
```

- [ ] **Step 4: Add docs/HISTORY.md section 34** at the end, in the same style as section 33:

```markdown
### 34. Drop files into the Pages panel, move pages between files (Claude Code, 2026-10-19)
The user: "i need drag pdf or image file to place in openned pdf file in page panel like moving page", then "and move
page cross file". PDFs and pictures dragged from File Explorer onto the Pages panel go in at a red line (pictures at
their own size, name order, one undo); Insert file takes pictures too. Thumbnails dragged onto another file's tab open
it after half a second and move there (Ctrl = copy; every page → copied, since a PDF needs a page). Part of 1.2.0.
```

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add CLAUDE.md docs/HISTORY.md && git commit -m "docs: drop into the Pages panel and moving pages between files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The What's new entry for 1.2.0 (this feature + the Microsoft Store) is written in the Store plan's release task, so `pnpm run dist` keeps matching package.json's version until then.

# Bohpum-Style Print Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> (2026-10-17: executed inline with superpowers:executing-plans — no sub-agents were asked for.)

**Goal:** Sastra's Print dialog becomes Bohpum's print screen: fills the window under the logo row, big dropdowns, a box with
the chosen layout's settings, a zoomable preview, and Close · Save as PDF · Print.

**Architecture:** All in `app/print.js` (markup, syncUI/readUI mapping, zoom, Save as PDF) and the print CSS block of
`app/index.html`; `printCmd` passes a `savePdf(name, bytes)` callback; main.js names the Save dialog "Save as PDF". The
planner (`pickPages`, `planSheets`, `drawSheet`) and the saved settings format don't change.
Spec: `docs/superpowers/specs/2026-10-17-print-screen-design.md`.

**Tech Stack:** Chromium customizable `<select>` (`<button><selectedcontent>`), pdf-lib `embedJpg`, Playwright tests outside the project.

## Global Constraints
- IDs kept: `#prPrinter #prCopies #prProps #prRange #prSubset #prReverse #prErr #prTile #prOverlap #prLabels #prMarks #prPer
  #prOrder #prBorder #prSubsetB #prBinding #prPaper #prPct #prInfo #prStage #prCanvas #prSheet #prPrev #prNext #prStatus
  #prCancel #prGo`. Changed: `#prMode` (now a big select), `#prScope` (select, was radios), `#prScale` (was radios prSize),
  `#prOrient` (was radios), `#prSides` (was #prDuplex + prFlip), `#prColor` (was #prGray). New: `#prRangeF #prPctF
  #prSidesNote #prPdf #prZoom #prZoomPct .pv-zoom .pr-head .pr-box`.
- Settings in `localStorage sastra-print` keep their shape (`gray`, `duplex`, `flip`, `size.how`, `orient`, …).
- Screen top = 45 px (logo row height, normal and maximized). Left column 360 px. Zoom 10 %–400 %, 100 % = 96 px per inch.
- Save as PDF: same sheets as Print, 300 dpi (150 over 150 sheets), JPEG 0.92, landscape sheets stay landscape; name
  `<name without .pdf>-<paper>.pdf`.
- `<S>\t\` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t\`.
  Electron launches: `unset ELECTRON_RUN_AS_NODE`, `--user-data-dir`. Commits on `feat/print-screen`.

---

### Task 1: The screen and the left column

**Files:** Modify `app/print.js` (ICON, bigOptions, MODES/ORIENTS/SIDES/COLORS, DIALOG, open(): class, inert row, scope
options, syncUI/readUI, change/input wiring, printer list, close), `app/index.html` (print CSS block, big-select CSS).
Test: `<S>\t\print-screen-test.js` section `screen`; `<S>\t\print-test.js` helpers.

**Interfaces:** Produces `bigOptions(items)` (items `[value, iconKey, title, explanation, disabled?]`), `#prScope` values
`all|current|selected|range`, `#prMode` values `size|poster|multiple|booklet`, `#prScale` `fit|actual|shrink|custom`,
`#prOrient` `auto|portrait|landscape`, `#prSides` `one|long|short`, `#prColor` `color|gray`.

- [ ] Step 1: write `print-screen-test.js` (sections `screen`, `zoom`, `pdf`; code in the test folder) and update
  print-test.js helpers: `radio(name, v)` → `setVal({prScope:'#prScope', prSize:'#prScale', prOrient:'#prOrient',
  prFlip:'#prSides'}[name], v)`; `mode(v)` → `setVal('#prMode', v)`; `setChk('#prGray', v)` → `setVal('#prColor', v ? 'gray'
  : 'color')`; `setChk('#prDuplex', v)` → `setVal('#prSides', v ? 'long' : 'one')`; checks: Booklet → `#prSides` disabled
  with value `short`; remembered mode → `#prMode.value`; 2+ selected → `#prScope.value === 'selected'`.
- [ ] Step 2: run `node print-screen-test.js screen` → FAIL (no `.print-screen`).
- [ ] Step 3: implement (code below), run until PASS; `node print-test.js` 71/71.
- [ ] Step 4: commit `feat: print screen like Bohpum's — fills the window, big dropdowns`.

`app/print.js` (after `clamp`):
```js
// pictures for the big dropdowns (24 × 24, drawn in currentColor), as in Bohpum
const ICON = {
  printer:'<path d="M7 9V3h10v6M7 18H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/>',
  all:'<path d="M8 3h9l3 3v13H8zM4 7v14h12"/>', current:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6"/>',
  selected:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 13l2 2 4-4"/>', custom:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h4"/>',
  size:'<path d="M5 3h14v18H5z"/><path d="M8 7h8v10H8z"/>', poster:'<path d="M3 4h18v16H3zM12 4v16M3 12h18"/>',
  multiple:'<path d="M5 3h14v18H5z"/><path d="M8 6h3v5H8zM13 6h3v5h-3zM8 13h3v5H8zM13 13h3v5h-3z"/>',
  booklet:'<path d="M12 6.5C10 5 7 4.5 3 5v14c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5zM12 6.5V20"/>',
  paper:'<path d="M6 3h12v18H6z"/>', auto:'<path d="M9 3h9v13H9z"/><path d="M4 11h11v10H4z"/>',
  portrait:'<path d="M7 3h10v18H7z"/><path d="M10 7h4"/>', landscape:'<path d="M3 7h18v10H3z"/><path d="M7 10h4"/>',
  one:'<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>', long:'<path d="M9 3h10v15"/><path d="M5 6h10v15H5z"/>',
  short:'<path d="M6 5h15v10"/><path d="M3 9h15v10H3z"/>', color:'<circle cx="9" cy="9" r="5"/><circle cx="15" cy="9" r="5"/><circle cx="12" cy="15" r="5"/>',
  gray:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>'
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
// Big dropdown (a real <select>), as in Bohpum: [value, picture, title, one line of explanation, disabled?] each
const bigOptions = items => PICKED + items.map(([v, ic, t, sub, off]) =>
  `<option value="${esc(v)}"${off ? ' disabled' : ''}><span class="ic">${icon(ic)}</span><span class="t"><b>${esc(t)}</b><small>${esc(sub)}</small></span></option>`).join('');
const MODES = [['size','size','One page per sheet','Fit, actual size or your own scale'], ['poster','poster','Poster','One page tiled over several sheets'],
  ['multiple','multiple','Multiple pages per sheet','2, 4, 6, 9 or 16 on each sheet'], ['booklet','booklet','Booklet','Folded sheets, pages in reading order']];
const ORIENTS = [['auto','auto','Auto Orientation','Each sheet turns to suit its pages'], ['portrait','portrait','Portrait Orientation','Tall sheet'], ['landscape','landscape','Landscape Orientation','Wide sheet']];
const SIDES = [['one','one','Print One Sided','Only print on one side of the paper'], ['long','long','Print on Both Sides','Flip sheets on the long edge'], ['short','short','Print on Both Sides','Flip sheets on the short edge']];
const COLORS = [['color','color','Colour','Print in colour'], ['gray','gray','Grayscale','Black and white only']];
```
`DIALOG`: `.pr-head` (h2 "Print"); `.pr-set`: `[data-desk]` "Printer" h4 + `#prPrinter.big` + `.pr-copies` (Copies, Printer
Properties); `[data-web]` hint; "Settings" h4; `#prScope.big`; `#prRangeF` (Pages box, hidden); `.pr-sub` (`#prSubset`,
`#prReverse`); `#prErr`; `#prMode.big`; `.pr-box` with the four `.pr-panel`s (size: `#prScale` + `#prPctF`; poster / multiple /
booklet as before); `#prPaper.big` (`PAPERS` → `[k,'paper',k,'w × h mm']`); `#prOrient.big`; `[data-desk]` `#prSides.big` +
`#prSidesNote`; `#prColor.big`. `.pr-view`: info, stage, nav, `.pv-zoom`. `.pr-foot`: status, Close `#prCancel`, Save as PDF
`#prPdf`, Print `#prGo`.

`open()`: `bg.className = 'modal-bg print-screen'`; `const bar = document.querySelector('.menubar'); if (bar) bar.inert = true;`
(and `bar.inert = false` in `close()`); `#prScope.innerHTML = bigOptions([...])` with the counts, value `selected` for 2+
selected else `all`; syncUI/readUI map `S` ↔ the selects (`#prColor` ↔ `S.gray`; `#prSides` ↔ `S.duplex`/`S.flip`, Booklet:
disabled, `short` for both sides else `one`, `#prSidesNote` shown; `#prScale`/`#prPctF` ↔ `S.size`; `#prRangeF` shown only for
`range`); change: `#prMode` → `S.mode = value; view = 0` then `changed()`; input: `#prRange` → `recompute()`; printer list →
`bigOptions(printers.map(p => [p.name,'printer',p.displayName, p.isDefault ? 'Default printer' : 'Printer']))`, none →
`[['','printer','No printers installed','Save as PDF still works']]`; the printer name in messages = the option's `<b>`.

---

### Task 2: Zoomable preview

**Files:** Modify `app/print.js` (zoom state, `setZoom`, `showZoom`, `drawPreview` sizes, wheel, keys, pan), CSS for
`.pr-stage.zoomed`, `.pv-zoom`, `.pr-nav`. Test: `print-screen-test.js zoom`.

- [ ] Step 1: run `node print-screen-test.js zoom` → FAIL.
- [ ] Step 2: implement:
```js
// zoom, as in Bohpum: 'fit' = the whole sheet; a number = against real size (1 = 100 %, 96 px per inch)
const ZMIN = 0.1, ZMAX = 4, PT = 96 / 72;
let zoom = 'fit', fitScale = 1, space = false, overView = false;
const scaleNow = () => zoom === 'fit' ? fitScale : zoom;
const toSlider = z => Math.round((Math.log(z) - Math.log(ZMIN)) / (Math.log(ZMAX) - Math.log(ZMIN)) * 1000);
const fromSlider = v => Math.exp(Math.log(ZMIN) + v / 1000 * (Math.log(ZMAX) - Math.log(ZMIN)));
function showZoom(){ /* % text, slider (unless being dragged), Fit sheet .on, stage .zoomed */ }
function setZoom(z, at){ /* stretch the canvas now, keep the point under `at` (or the middle) still, redraw() */ }
```
  `drawPreview`: `fitPx = min(w / sh.w, h / sh.h)`, `fitScale = fitPx / PT`, `cssPx = zoom === 'fit' ? fitPx : zoom * PT`, bitmap
  scale `min(cssPx * dpr, 16384 / max side, sqrt(64e6 / area))`, then `showZoom()`. Wheel: Ctrl → `setZoom(×1.2 / ÷1.2, mouse)`;
  else fitted → flip sheets; else scroll. Keys (capture, in the print screen): Ctrl+0 / Ctrl+= / Ctrl++ / Ctrl+−; Space over the
  preview (not in a field) → grab; pointerdown middle button or Space + left → pan with pointer capture.
- [ ] Step 3: run until PASS; commit `feat: print preview zoom (bar, Ctrl+wheel, keys, Space-drag)`.

---

### Task 3: Footer summary and Save as PDF

**Files:** Modify `app/print.js` (`summary()`, `begin()/end()`, `savePdf()`, `#prPdf`), `app/index.html` (`savePrintPdf`,
`printCmd` passes it), `main.js` (`save-dialog` title for kind `pdf`). Test: `print-screen-test.js pdf`.

- [ ] Step 1: run `node print-screen-test.js pdf` → FAIL.
- [ ] Step 2: implement:
```js
// print.js — exactly what prints, as a PDF: the same sheets at print resolution; a landscape sheet stays landscape
async function savePdf(){
  if (running || !plan.sheets.length) return;
  begin();
  const sheets = plan.sheets, n = sheets.length, unit = (n > 150 ? 150 : 300) / 72;
  let bytes = null, err = null;
  try {
    const out = await PDFLib.PDFDocument.create();
    for (let k = 0; k < n && !cancelled; k++) {
      status(`Preparing sheet ${k + 1} of ${n}…`);
      const sh = sheets[k], c = document.createElement('canvas');
      c.width = Math.round(sh.w * unit); c.height = Math.round(sh.h * unit);
      await drawSheet(getPage, doc.sizes, sh, unit, c.getContext('2d'), { gray: S.gray, cancelled: () => cancelled });
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); c.width = c.height = 0;
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      out.addPage([sh.w, sh.h]).drawImage(img, { x:0, y:0, width:sh.w, height:sh.h });
    }
    if (!cancelled) { status('Making the PDF…'); bytes = await out.save(); }
  } catch (e) { console.error(e); err = e?.message || String(e); }
  end();
  if (cancelled || err) { syncUI(); updateView(); status(cancelled ? 'Cancelled' : `Couldn't make the PDF: ${err}`); return; }
  const saved = await savePdfFile(`${doc.name.replace(/\.pdf$/i, '')}-${S.paper}.pdf`, bytes);
  if (!saved) { updateView(); status('Not saved'); return; }
  close(); toast(`Saved ${saved} · ${n} sheet${n > 1 ? 's' : ''}`);
}
```
```js
// index.html — the print screen's "Save as PDF": the Save dialog in the file's folder (desk), else a download → saved name or null
async function savePrintPdf(d, name, bytes){
  if (!desk) return (await saveFile(name, new Blob([bytes], { type:'application/pdf' }))) ? name : null;
  const p = await desk.saveDialog(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'pdf', d.saveDir || (d.path ? d.path.replace(/[\\/][^\\/]*$/, '') : null));
  return p ? p.split(/[\\/]/).pop() : null;
}
```
  main.js: `title: kind === 'export' ? 'Export' : kind === 'pdf' ? 'Save as PDF' : 'Save As'`. Summary in the footer when idle:
  `N sheets|sides · paper · one side|both sides (desk) · grayscale`.
- [ ] Step 3: run until PASS; commit `feat: Save as PDF in the print screen (exactly what prints)`.

---

### Task 4: Everything still works; docs
- [ ] All suites from source, then `npm run build:menu && npx electron-builder --win --dir` and `PACKED=1` (print-screen,
  print 71, controls 15, colour 11, menu 51, folder 23, close 12, titlebar 43 — copy `pdfs\ten.pdf` to `out\` after print-test,
  images 61, ops 10, unit 38).
- [ ] CLAUDE.md: the "Printing" bullet describes the print screen (fills the window under the logo row, inert row, big dropdowns,
  `.pr-box`, zoom, Save as PDF, `savePdf` callback); README feature line; HISTORY entry. Commit `docs: print screen like Bohpum's`.

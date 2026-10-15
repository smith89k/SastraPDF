# Print Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Acrobat-style Print window (printer, copies, grayscale, pages, Size/Poster/Multiple/Booklet,
orientation, paper, both sides, Properties, live preview) that prints straight to the chosen printer.

**Architecture:** New `app/print.js` (classic script, `window.SastraPrint`) holds the pure page picker and
sheet planner, the sheet drawer and the dialog. `app/index.html` adds CSS, the Print button, Ctrl+P and the
right-click entry, and passes the active document in. `main.js`/`preload.js` add three IPC calls: list
printers, print silently with validated options, open Windows printing preferences.

**Tech Stack:** Electron 44 (`webContents.print`, `getPrintersAsync`), pdf.js 6.4.299, plain JS/CSS, Playwright
(`playwright-core`, outside the project) for tests.

## Global Constraints
- Spec: `docs/superpowers/specs/2026-10-15-print-dialog-design.md` (all numbers come from there).
- No network, no new libraries. Khmer-capable fonts only via existing `--ui`/`--mono` stacks.
- Anything floating over the page goes on `<body>`. CSP has no `unsafe-eval`: tests poll with `page.evaluate`.
- `unset ELECTRON_RUN_AS_NODE` before launching Electron; launch tests with `--user-data-dir=<scratch>`.
- Tests never send a job to a real printer: main's `print` handler is swapped for `printToPDF`.
- Test script: `<scratchpad>/t/print-test.js`; test PDFs: `<scratchpad>/t/pdfs/`.

## Files
- Create `app/print.js` — `pickPages`, `planSheets`, `drawSheet`, `openPrintDialog`, print run.
- Modify `app/index.html` — `<script src="print.js">`, dialog CSS, `#printArea` print CSS, `#bPrint`,
  printer icon, Ctrl+P, CMENU entry, `updateUI` list, menu `print` command, breakpoints.
- Modify `main.js` — File > Print…, IPC `printers`, `print`, `printer-prefs`.
- Modify `preload.js` — `printers()`, `print(opts)`, `printerPrefs(name)`.
- Modify `CLAUDE.md`, `README.md` — document the feature.

## Interfaces (shared by all tasks)
```js
// app/print.js
SastraPrint.PAPERS            // { A4:[210,297], A3:[297,420], A5:[148,210], Letter:[215.9,279.4], Legal:[215.9,355.6] } (mm, portrait)
SastraPrint.pickPages(n, { scope:'all'|'current'|'selected'|'range', current, sel:number[], range:string,
                           subset:'all'|'odd'|'even', reverse:boolean }, parseRanges)
  // -> { pages:number[] (0-based), error:string|null }
SastraPrint.planSheets(sizes /* [{w,h}] pt */, pages, o)
  // o = { mode:'size'|'poster'|'multiple'|'booklet', paper, orient:'auto'|'portrait'|'landscape',
  //       size:{ how:'fit'|'actual'|'shrink'|'custom', pct }, poster:{ pct, overlap, labels, marks },
  //       multi:{ n, order:'h'|'hr'|'v'|'vr', border }, booklet:{ subset:'both'|'front'|'back', binding:'left'|'right' },
  //       reverse /* booklet only: sheet order */, name }
  // -> { sheets:[{ w, h, items:[{ i /* or null */, x, y, s, rot /* 0|90 */ }], clip:{x,y,w,h}|null,
  //                border:boolean, marks:[[x1,y1,x2,y2]], label:string|null, tag:string /* "blank,1" */ }],
  //      duplex:'shortEdge'|null /* forced by booklet both */ }
SastraPrint.drawSheet(getPage /* i -> Promise<PDFPageProxy> */, sizes, sheet, pxPerPt, ctx, { gray, base /* [a,b,c,d,e,f]|null */ })
SastraPrint.open({ doc, desk, toast, svg, parseRanges })   // opens the dialog for doc
// preload.js
window.sastra.printers() -> Promise<[{ name, displayName, isDefault }]>
window.sastra.print({ deviceName, copies, color, duplexMode, pageSize }) -> Promise<{ ok, reason }>
window.sastra.printerPrefs(name) -> Promise<boolean>
```

---

### Task 1: Electron side (IPC, preload, File > Print…)
**Files:** `main.js`, `preload.js`; test `<scratchpad>/t/print-test.js` (section "ipc").
- [ ] Write test: launch the app with the 10-page PDF; `window.sastra.printers()` returns ≥1 printer with exactly
  one `isDefault`; `window.sastra.print` and `printerPrefs` are functions; `printerPrefs('no such printer')`
  resolves `false`; File menu has an item labelled `&Print…` with accelerator `Ctrl+P`.
- [ ] Run: `node print-test.js ipc` → FAIL (`printers is not a function`).
- [ ] Implement as in the spec's "Main process" section (validate every field in main; `execFile` only for a
  name found in `getPrintersAsync()`), menu item `k('&Print…', 'Ctrl+P', 'print')` after Save As.
- [ ] Run → PASS. Commit `feat(print): printer list, silent print and printer preferences over IPC`.

### Task 2: Page picker and sheet planner (pure)
**Files:** create `app/print.js` (PAPERS, pickPages, planSheets), `app/index.html` loads it; test section "plan".
- [ ] Write tests, evaluated in the page with A4 sizes (595.28×841.89; page 10 landscape):
  - pickPages: all→10 pages; range `2-4, 7`→[1,2,3,6]; even of that → [1,3]; reverse → [3,1];
    `selected` with sel [4,2] → [2,4]; bad range → error text; even of [0] → empty.
  - Size fit: 10 sheets; sheet 0 portrait 595×842, item s≈0.952 centred; auto: sheet 9 landscape;
    orient portrait: sheet 9 portrait with s<1; actual: s=1; shrink on an A3 page → s<1; custom 50 → s=0.5.
  - Multiple 4 → 3 sheets, portrait, 4/4/2 items; Multiple 2 → 5 sheets landscape; order `hr` puts first page right.
  - Booklet both → tags `blank,1|2,blank|10,3|4,9|8,5|6,7`, duplex `shortEdge`; front → `blank,1|10,3|8,5`;
    right binding swaps (`1,blank` first); reverse + front → `8,5|10,3|blank,1`.
  - Poster 200% on page 1: auto → 6 sheets, landscape; portrait → 9; labels on → `label` contains `page 1`;
    marks on → 8 marks per sheet; clip set on every sheet.
- [ ] Run → FAIL (`SastraPrint is not defined`). Implement per spec "Sheet planning". Run → PASS.
- [ ] Commit `feat(print): page picker and sheet planner`.

### Task 3: Sheet drawer, dialog and entry points
**Files:** `app/print.js` (drawSheet, open), `app/index.html` (CSS, `#bPrint`, icon, Ctrl+P, CMENU, updateUI,
menu command); test section "dialog".
- [ ] Write tests: `#bPrint` disabled with no PDF; with PDF Ctrl+P opens `.modal.print`; button, menu command
  (`webContents.send('menu','print')`) and right-click entry open it too; printer select filled with default
  chosen; preview text `Sheet 1 of 10`; switching to Multiple 4 → `of 3`; Booklet → `of 6`; range field
  `2-4, 7` → `of 4`; bad range shows an error and disables Print; preview canvas has non-white pixels;
  grayscale on → preview pixels have r=g=b; Esc closes; settings remembered after reopening (mode, paper).
- [ ] Run → FAIL. Implement per spec "The dialog" and "Drawing sheets". Run → PASS.
- [ ] Commit `feat(print): Acrobat-style Print dialog with live preview`.

### Task 4: Printing run
**Files:** `app/print.js` (prepare + send + cleanup), `app/index.html` (`#printArea` CSS); test section "print".
- [ ] Write tests: swap main's `print` handler (`ipcMain.removeHandler('print')`, new handler calls
  `e.sender.printToPDF({ pageSize, printBackground:true, margins:{top:0,bottom:0,left:0,right:0} })`, saves
  `<scratch>/out-N.pdf`, records the options and the `data-pages` of `#printArea img`); then:
  Size/All → 10 pages, every page 595×842 portrait; Booklet both → 6 pages, options.duplexMode `shortEdge`,
  tags in order; Multiple 2 + Letter → 5 pages 612×792; grayscale → `color:false`; copies 3 → `copies:3`;
  `#printArea` empty afterwards; toast `Sent`. Render out-1.pdf page 1 and page 10 to PNG and look at them.
- [ ] Run → FAIL. Implement per spec. Run → PASS. Commit `feat(print): print sheets to the chosen printer`.

### Task 5: Layout, docs, regression
- [ ] Measure the logo row at 1535/1536, 1299/1300, 1239/1240, 1179/1180, 1119/1120, 1020 px: `.toolbar`
  must not scroll above 1020. Shift breakpoints if needed (CSS + CLAUDE.md numbers).
- [ ] No console errors through the whole run; screenshots of the dialog in light and dark.
- [ ] Update CLAUDE.md (layout list, print section, IPC, status) and README features.
- [ ] Commit `docs: print dialog`.

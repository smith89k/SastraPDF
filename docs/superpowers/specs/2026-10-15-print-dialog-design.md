# Print dialog (Acrobat-style): design

Date: 2026-10-15 · Status: approved by the user in chat, before implementation

## Goal
Sastra PDF cannot print. Add a Print window modelled on Acrobat's: printer, copies, grayscale,
pages to print, the four sizing modes (Size, Poster, Multiple, Booklet), orientation, paper,
both-sides printing, a printer Properties button, and a live preview of every sheet.

## Approach
The app lays out and draws every sheet of paper itself and sends the sheets to the printer with
Electron's `webContents.print({ silent:true, deviceName, … })`. Pages are rasterised at 300 dpi
(Acrobat's "Print as image"; Firefox prints PDFs the same way at 150 dpi). Rejected: the plain
Windows print dialog (no preview, no sizing modes) and Chromium's PDF plugin (unreliable in
Electron, no booklet/poster/preview).

## Entry points
- Menubar button `#bPrint` (printer icon, label "Print") right after Save. Disabled with no PDF or
  while busy (explicit list in `updateUI`). Hidden while maximized, like the other menubar buttons.
- Ctrl+P (page keydown handler, after the modal/input checks, like Ctrl+S).
- File > Print… (`Ctrl+P`, `registerAccelerator:false`, sends `print`).
- Right-click menu entry "Print…" (`['bPrint','Print…','Ctrl+P']`, after Present).
- Adding the button changes the logo row's width: re-measure the shedding breakpoints.

## The dialog (`openPrint`)
A `.modal.print` on `<body>` (like About), about 980 × 680 px, capped to the window. Left column:
settings (scrolls). Right column: preview on `--canvas`. Footer: status text, Cancel, Print.

Settings, top to bottom:
1. **Printer** select (from `desk.printers()`; remembered printer if still installed, else the
   system default) + **Properties** button. **Copies** (1–999). **Print in grayscale (black and
   white)** checkbox.
2. **Pages to print**: All · Current page · Selected pages (disabled with no selection) ·
   Pages [text, e.g. `1-3, 7`, parsed with `parseRanges`; errors shown inline, Print disabled].
   Default: Selected when 2+ pages are selected, else All. **More options**: select
   All pages in range / Odd pages only / Even pages only (by page number) + **Reverse pages**.
3. **Page sizing & handling**: segmented Size | Poster | Multiple | Booklet, each with its panel:
   - Size: Fit · Actual size · Shrink oversized pages · Custom scale [%] (1–1000).
   - Poster: Tile scale [%] (10–1000, default 100), Overlap [mm] (0–50, default 0),
     Labels, Cut marks.
   - Multiple: Pages per sheet [2 4 6 9 16], Page order [Horizontal, Horizontal reversed,
     Vertical, Vertical reversed], Print page border.
   - Booklet: Booklet subset [Both sides, Front side only, Back side only], Binding [Left, Right].
     Odd/even is hidden; Reverse reverses the sheet order (for the back-side pass).
4. **Orientation**: Auto portrait/landscape · Portrait · Landscape. **Paper**: A4 (default), A3,
   A5, Letter, Legal.
5. **Print on both sides of paper** + Flip on long edge / Flip on short edge. Booklet "Both sides"
   forces it on, short edge (shown ticked and disabled, with a note: a printer that can't print
   both sides should use Front side only, turn the stack over, then Back side only).

Preview: one sheet at a time, fitted to the column, white paper with a shadow, grey when
grayscale is on. Below it: ‹ "Sheet 3 of 12" › and "A4 · portrait · scale 95%" (scale only in
Size mode). Redrawn 120 ms after any change; stale draws are dropped (generation counter).
Nothing to print (e.g. even pages of page 1) → preview says so, Print disabled.

Keys: Esc = Cancel (or cancel preparation), Enter = Print. Settings are remembered in
localStorage `sastra-print` (printer, paper, mode and its options, orientation, grayscale, both
sides, flip); copies and page choice are not.

## Sheet planning (pure layout, points)
`planSheets(d, opts)` → `{ paper, sheets:[{ w, h, items:[{ i, x, y, s, rot }], clip, border,
marks, label }] }`. Sizes are pdf.js display sizes (`d.sizes`, page rotation included). `x,y` is
the top-left of the page box on the sheet, `s` its scale, `rot` 0 or 90 (extra, clockwise), `i`
null = blank. Constants: margin M = 5 mm, Multiple gap G = 3 mm. Pages = scope → odd/even →
reverse (Booklet: see above).

- **Size**: one page per sheet. Orientation Auto: the sheet takes the page's orientation;
  Portrait/Landscape: fixed sheet, no rotation. Fit: `s = min((W-2M)/pw, (H-2M)/ph)`; Actual:
  1; Shrink: `min(1, fit)`; Custom: pct/100. Centred; anything beyond the paper is cut off.
- **Multiple**: n per sheet. Grids — portrait sheet 2→1×2, 4→2×2, 6→2×3, 9→3×3, 16→4×4;
  landscape sheet 2→2×1, 6→3×2, others the same. Auto picks the orientation whose cell fits the
  first page larger (tie → portrait). Cells fill the sheet minus M, G between cells; each page is
  fitted and centred in its cell. Order: horizontal = row by row left→right, reversed =
  right→left; vertical = column by column top→bottom, reversed = right column first. Border =
  0.5 pt grey rectangle round each page.
- **Booklet**: pages padded with blanks to a multiple of 4 (N); N/4 landscape sheets; each half
  holds one page fitted inside the half minus M on the outer sides, centred. Left binding: sheet k
  front = [N-1-2k | 2k], back = [2k+1 | N-2-2k]; right binding swaps left/right. Output: both →
  front0, back0, front1, …; front only / back only → those sides.
- **Poster**: per page, scaled size PW×PH = page × tile%. Tile area A = sheet − 2m (m = 10 mm when
  labels or cut marks are on, else M); step = A − overlap; cols = ceil((PW − o)/step), rows
  likewise (min 1). The poster is centred on the tile grid. Auto orientation = the one with fewer
  tiles (tie → portrait). Each tile shows its part of the page clipped to A. Label: 7 pt grey text
  in the top margin, "name · page 3 · row 1, column 2". Cut marks: 5 mm hairlines out from each
  corner of A.

## Drawing sheets
`drawSheet(d, sheet, pxPerPt, ctx, gray)` fills white, then for each item renders only the
visible part (item box ∩ clip ∩ sheet) into its own canvas with pdf.js
(`getViewport({ scale, rotation:(page.rotate+rot)%360 })`, `transform` offset), and `drawImage`s
it with `ctx.filter='grayscale(1)'` when gray (pdf.js paints a white background over the whole
canvas, so items can't share one). Then borders, cut marks, labels. The preview uses it at screen
resolution.

For printing: landscape sheets are drawn into a portrait canvas through a base transform
(content top → the paper's left edge, the way a driver prints landscape), so the printer always
gets portrait sheets of the chosen paper. 300 dpi (150 dpi when there are over 150 sheets, to
save memory), JPEG 0.92, one `<img class="psheet">` per sheet in `#printArea` (on `<body>`;
hidden on screen). `@media print` hides everything else and a generated `@page { size:<paper>;
margin:0 }` sets the paper. Each image is `data-pages`-tagged (e.g. `blank,1`) for tests. The
footer shows "Preparing sheet k of n…" with Cancel; after all images decode, the job is sent;
afterwards `#printArea` is emptied and blob URLs revoked. Result: toast "Sent n sheets to
<printer>", "Printing cancelled", or the error.

## Main process (main.js / preload.js)
- `printers` → `getPrintersAsync()` mapped to `{ name, displayName, isDefault }`.
- `print` → `win.webContents.print({ silent:true, printBackground:true, deviceName, copies
  (1–999), collate:true, color, duplexMode (simplex|shortEdge|longEdge), landscape:false,
  pageSize (A3|A4|A5|Letter|Legal), margins:{ marginType:'none' } })`, resolves `{ ok, reason }`.
  Every field is validated in main.
- `printer-prefs` → only if the name is in the printer list: `execFile('rundll32.exe',
  ['printui.dll,PrintUIEntry','/e','/n',name])` (Windows "Printing preferences"; changes stay as
  that printer's defaults for this user, unlike Acrobat's per-job Properties — the button's
  tooltip says so).
- Preload: `printers()`, `print(opts)`, `printerPrefs(name)`.

## Plain-browser fallback
Without `desk`: no printer list, Properties, Copies or both-sides rows (a line says the browser
will ask for the printer); Print fills `#printArea` and calls `window.print()`, cleaning up on
`afterprint`.

## Testing
Playwright on Electron (script outside the project, separate `--user-data-dir`), with a generated
10-page PDF with big page numbers: pages 1–9 A4 portrait, page 10 A4 landscape:
- Ctrl+P, the button, File > Print and the right-click entry open the dialog; all disabled with no
  PDF; Esc closes; Enter prints.
- Printer list filled, default selected; Properties wired (not clicked in tests).
- Sheet counts via the preview text: Size/All 10; range `2-4, 7` → 4; even → 2; Multiple 4 → 3;
  Multiple 2 → 5 landscape; Booklet both → 6 sides (3 sheets), front only → 3, order
  `blank,1 | 2,blank | 10,3 | 4,9 | 8,5 | 6,7`; Poster 200 % A4 → Auto 6 tiles per page
  (landscape), Portrait 9.
- Print: main's `print` handler is swapped (via `electronApp.evaluate`) for one that calls
  `printToPDF` with the same paper and saves the file; check page count, every page portrait A4
  (595 × 842 pt), and look at rendered pages. Check `data-pages` order and `#printArea` emptied.
- Preview canvas not blank; grayscale preview has no colour; no console errors.
- Logo-row breakpoints re-measured with the new button.
- Real paper: the user prints one page on an office printer (never sent by the tests).

## Out of scope
Vector printing; booklet sheet range and gutter; Poster "tile only large pages"; custom
pages-per-sheet grids; per-page paper source; a collate switch; print-to-file.

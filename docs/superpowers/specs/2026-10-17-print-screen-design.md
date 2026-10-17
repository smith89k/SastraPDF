# Print screen like Bohpum's — design

Date: 2026-10-17 · Status: approved by the user in chat (two parts, "Full Bohpum layout", Save as PDF = "Exactly what prints")
Model: Bohpum's print screen (E:\_httdocs\Bohpum, src/print.js `openPrintDialog`, src/app.css "print screen" block;
its design: Bohpum docs/superpowers/specs/2026-10-16-print-screen-publisher-dropdowns-design.md).
Replaces the look of Sastra's Print dialog (2026-10-15-print-dialog-design.md); the planner (`pickPages`, `planSheets`,
`drawSheet`), the print run and the saved settings stay.

## 1. The screen
- `.modal-bg.print-screen`: starts under the logo row (`top: 45px` — the row is 45 px both normal and maximized), fills the
  rest of the window, `--chrome` background, no dimming; `.modal.print` fills it (no radius, no shadow).
- While it is open the logo row is `inert` (its buttons do nothing) and greyed (`.menubar[inert]` buttons/selects/tabs at
  opacity .45); the row still moves / maximizes / closes the window (drag region + Windows' caption buttons). ☰, Alt and
  F10 are already blocked while a `.modal-bg` exists. Closing the screen takes `inert` off.
- Grid: header row ("Print", 16 px semibold, 18 px 24 px padding, bottom line) · left column 360 px (`--panel`, scrolls on
  its own, right line) | preview (`--canvas`) · footer across both.

## 2. Left column (top to bottom)
Big dropdown = `<select class="big">` starting with `<button><selectedcontent>` and options
`<span class="ic">svg</span><span class="t"><b>title</b><small>explanation</small></span>` (Bohpum's CSS: min-height 52 px,
radius 8, 30 px picture tile in `--accent-soft` / `--accent`; in the list a tile is `--hover` / `--muted`, the chosen one
`--chrome` / `--accent`). Headings: 11 px uppercase `--muted` ("PRINTER", "SETTINGS").
- **PRINTER** (desk only): `#prPrinter` — printer · display name · "Default printer" / "Printer"; loading: "Finding
  printers…" · "Looking for printers on this PC"; none: "No printers installed" · "Save as PDF still works" (disabled; Print
  disabled). Row: Copies `#prCopies` (number 1–999, 90 px) left, **Printer Properties** `#prProps` right.
  Plain browser: the hint "Your browser asks which printer to use in the next window." instead.
- **SETTINGS**
  1. `#prScope` Pages: `all` Print All Pages · "The whole document (N pages)"; `current` Print Current Page · "Page N";
     `selected` Print Selected Pages · "N pages selected" (option disabled when nothing is selected; chosen by default for
     2+ selected, as today); `range` Custom Print · "Type which pages to print" → the **Pages** box `#prRange` (`1-3, 7`)
     appears under it. Under that a small row: `#prSubset` (All pages in range / Odd pages only / Even pages only,
     disabled for Booklet) and `#prReverse` "Reverse pages". `#prErr` under them.
  2. `#prMode` Layout: `size` One page per sheet · "Fit, actual size or your own scale"; `poster` Poster · "One page tiled
     over several sheets"; `multiple` Multiple pages per sheet · "2, 4, 6, 9 or 16 on each sheet"; `booklet` Booklet ·
     "Folded sheets, pages in reading order". Under it a `.pr-box` (1 px `--line`, radius 8, `--chrome`) with the chosen
     layout's settings (`.pr-panel[data-mode]`):
     - size: `#prScale` (Fit to paper / Actual size / Shrink oversized pages / Custom scale); `#prPct` % only for Custom.
     - poster: `#prTile` %, `#prOverlap` mm, `#prLabels`, `#prMarks` (as today).
     - multiple: `#prPer`, `#prOrder`, `#prBorder` (as today).
     - booklet: `#prSubsetB`, `#prBinding`, the folding tip (as today).
  3. `#prPaper` Paper: A4 · "210 × 297 mm", A3, A5, Letter, Legal (`PAPERS`).
  4. `#prOrient` Orientation: `auto` Auto Orientation · "Each sheet turns to suit its pages"; `portrait` Portrait Orientation ·
     "Tall sheet"; `landscape` Landscape Orientation · "Wide sheet".
  5. `#prSides` (desk only): `one` Print One Sided · "Only print on one side of the paper"; `long` Print on Both Sides ·
     "Flip sheets on the long edge"; `short` Print on Both Sides · "Flip sheets on the short edge". Booklet: disabled and
     showing what Booklet does (`short` for both sides, `one` for front/back only) with the note "Set by Booklet".
  6. `#prColor` Colour: `color` Colour · "Print in colour"; `gray` Grayscale · "Black and white only".
- The saved settings (`localStorage sastra-print`) are unchanged: `gray`, `duplex` + `flip`, `size.how`, `orient`… map to the
  dropdowns, so a user's old settings carry over.

## 3. Preview
- `.pr-info` line on top (as today), the sheet in `.pr-stage` (now a scroll box), "‹ Sheet 1 of N ›" `.pr-nav` at the bottom
  centre (as today), and the **zoom bar** `.pv-zoom` at the bottom right as Bohpum's: `−` · slider (10 %–400 %, even per
  doubling) · `+` · `NN%` · **Fit sheet** (on while fitted). 100 % = real size (96 px per inch).
- Ctrl + wheel zooms on the spot under the mouse; Ctrl+0 fit, Ctrl++ / Ctrl+− zoom (these keys stay in the print screen).
  Wheel alone: flips sheets while fitted (as today), scrolls when zoomed in. Space + drag or the middle button moves the view.
- A zoom change stretches the current picture at once, keeps the point under the mouse (or the middle) still, then redraws
  sharp (the existing 120 ms redraw). The drawn bitmap is capped (16 384 px a side, 64 MP): past that it is drawn less
  sharp and stretched. Zoom stays while settings change and resets to Fit when the screen opens.

## 4. Footer
- `#prStatus` left: when idle a summary — "10 sheets · A4 · both sides · grayscale" ("Side" counts for a both-sides booklet as
  in the preview); while working the progress, as today.
- Right: **Close** (`#prCancel`; stops a running job, as Cancel did), **Save as PDF** (`#prPdf`), **Print** (`#prGo`, primary).
  Esc = Close (or stop); Enter = Print, except in a button, a dropdown or while a list is open.

## 5. Save as PDF (exactly what prints)
- Makes the sheets the same way as Print (same planner, `drawSheet`, grayscale, 300 dpi; 150 dpi over 150 sheets; JPEG 0.92)
  but a landscape sheet stays a landscape page (no turning onto portrait paper — that is only for printer drivers).
  pdf-lib `embedJpg` → one page per sheet, the sheet's size in points. Copies and sides don't apply.
- Name `<file name without .pdf>-<paper>.pdf` (Bohpum's rule), e.g. `report-A4.pdf`. `open()` gets a `savePdf(name, bytes)`
  callback from index.html: desk → `desk.saveDialog(name, bytes, 'pdf', d.saveDir || folder of d.path)` (main: title "Save as
  PDF" for kind `pdf`); plain browser → download. Saved → screen closes, toast "Saved report-A4.pdf · 10 sheets"; dialog
  cancelled → screen stays, status "Not saved"; Close during the run stops it ("Cancelled").
- Works with no printer installed and in the plain browser.

## Testing (Playwright, outside the project)
- New `print-screen-test.js`: the screen starts at the logo row's bottom and fills the window (also after a resize); the
  logo row is inert and greyed and comes back on Close; every big dropdown has `appearance: base-select` and shows title +
  explanation; mouse picks: Pages → Custom Print shows the Pages box; Layout → each layout shows its own box only; Sides
  locked for Booklet; Colour → Grayscale greys the preview; zoom: the bar's + / Fit sheet, Ctrl + wheel, Ctrl+0; wheel flips
  sheets only while fitted; Save as PDF (dialog stubbed in main) writes a PDF with one page per sheet at paper size, a
  booklet's sheets landscape, grayscale pixels grey; Save dialog cancelled → screen stays; footer summary text; light and
  dark screenshots.
- `print-test.js` (71) updated for the new controls (`mode()`, `radio('prScope')`, `#prGray`, `#prDuplex`/`prFlip`,
  "dialog fits 800 × 600" → the screen fits the window) and passes in full; controls, colour, menu, folder, close,
  titlebar, images, ops tests still pass — from source and packaged.

## Out of scope
A separate print window, dragging pages on the preview, Bohpum's position pad / crop marks / printer adjustment (they are
for publishing cards, not for PDF printing), vector "Save as PDF".

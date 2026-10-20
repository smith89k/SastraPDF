# Sharper pages on screen and on paper — design

Date: 2026-10-20 · Status: approved by the user ("Yes, go ahead").

The user's words: "pdf should be more sharper (acrobat look sharper than sastra pdf)", on screen and in print. Acrobat Pro
is installed on this PC (its "Adobe PDF" printer is there), so the two can be compared side by side.

## What was measured (2026-10-20, the user's PC: 175 % scaling, `devicePixelRatio` 1.75)
- **The page canvas is NOT stretched.** At 100 %, fit width and 125 % the canvas is `floor(css × dpr)` pixels and
  Chromium pixel-snaps it: a pixel-exact capture (`webContents.capturePage`) of the screen equals the canvas's own pixels
  (a 4× close-up of the Khmer report looked identical). Moving it by sub-pixels with a transform made it WORSE (a
  transform isn't snapped) — so no layout change is needed.
- **The difference is how letters are drawn.** pdf.js draws glyphs on a transparent canvas, so Chromium uses grey
  (greyscale) anti-aliasing. Acrobat on Windows uses ClearType (LCD) smoothing, which looks crisper on an LCD screen.
  An **opaque** canvas (`getContext('2d', { alpha:false })`) makes Chromium draw the same glyphs with LCD
  anti-aliasing — the close-up showed the colour fringes of ClearType on the Khmer text.
- **The dpr is capped at 2** in `drawPage` and Present: on a screen above 200 % the canvas is stretched (soft).
- **Printing** sends a 300 dpi JPEG (0.92) of each sheet (150 dpi over 150 sheets); Acrobat sends the page itself
  (vector), which the printer draws at its own resolution (the office printers: 600 / 1200 dpi). Printing the PDF itself
  through Chromium's PDF engine was tried in Electron 44 (hidden or shown window, `plugins:true`, silent
  `webContents.print` to Microsoft Print to PDF): "Print job canceled" / "Failed to convert PDF: Connection to
  PdfToEmfConverter error" — not possible, so the sheets stay pictures, made sharper.
- Cost of one A4 sheet (Khmer report page 2): 300 dpi JPEG 241 KB · 600 dpi PNG 0.99 MB (a scanned page: 3.2 MB);
  encoding ≈ 0.4–0.5 s at 600 dpi.

## A. Screen
- `drawPage` (viewer, also the maximized slideshow) and Present's `showCanvas` use `getContext('2d', { alpha:false })`
  (both already fill white first), so text gets ClearType like Acrobat. Chromium follows Windows' own setting
  (ClearType off → grey as now).
- Present sizes its canvas in CSS as `floor(s.w × fit)` while the canvas is `floor(s.w × fit × dpr)` pixels — up to
  ~2 px apart, a slight stretch. Its CSS size becomes `canvas pixels / dpr`, so it is 1 : 1 too.
- Only when the canvas is shown 1 : 1: if the 4800 px limit made the canvas smaller than `zoom × dpr` (very high zoom),
  it is stretched, so it keeps the transparent (grey) context — LCD colour fringes must never be stretched.
- The dpr cap of 2 goes (`window.devicePixelRatio` as it is); the 4800 px limit still guards memory.
- Thumbnails (drawn at 2× and shrunk), print and exported images keep grey anti-aliasing: ClearType is only for
  pictures shown 1 : 1 on this screen.

## B. Print (app/print.js `go`)
- Sheets are drawn at **600 dpi** and stored as **PNG** (lossless: no JPEG fuzz around letters), as long as the job is
  at most **50 A4-sized sheets** (A3 counts 2, A5 ½, Letter / Legal by area); up to 150 A4-sized sheets: 300 dpi PNG;
  more: 150 dpi JPEG 0.92 as today (keeps memory and the spool sane on very long jobs).
- Everything else stays: pdf.js `intent:'print'`, grey mode, landscape sheets turned onto portrait paper, the summary,
  Cancel.
- **Save as PDF** is not changed (300 / 150 dpi JPEG) — a 600 dpi PNG PDF would be many times bigger, and it is made to
  be sent, not printed.

## Not in this work
- Vector printing (not possible through Electron's printing, see above).
- A sharper Save as PDF, a print quality setting.

## Testing
- **sharp-screen** (Playwright, the Khmer report + ten.pdf): page canvases are opaque (`getContextAttributes().alpha`
  false) and 1 : 1 at 100 % / fit width / 125 %; at 800 % (past the 4800 px limit) the canvas is transparent; a capture
  of a text block shows LCD colour (R ≠ B on edge pixels) where Windows' ClearType is on; thumbnails stay grey;
  Present's canvas is opaque. Compared with a screenshot of the same page in Acrobat (by eye, saved for the user).
- **print** (print-test.js with main's `print` swapped for `printToPDF`, as now): the sheet images in `#printArea` are PNG
  at 600 dpi for a 10-page job, 300 dpi for 60 A4 pages (or 30 A3), JPEG 150 dpi past 150; output pages still the right
  paper size; Cancel still works. Then the existing print 71 and print-screen 38 checks.
- On paper (the user): one Khmer page from Acrobat and from Sastra PDF on the same printer.

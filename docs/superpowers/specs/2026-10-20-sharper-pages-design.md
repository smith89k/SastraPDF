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
- **Changed after measuring (2026-10-20, the user chose "smart" — "what if i have 200page?"):** the first version
  (600 dpi PNG up to 50 A4-sized sheets, 300 PNG up to 150, then 150 JPEG) failed on heavy jobs: 50 full-page noisy
  scans at 600 dpi PNG = 85 MB a sheet, renderer ~8.4 GB, all processes ~11.5 GB, and Chromium's print step failed
  ("Printing failed"). Measured, 50 A4 sheets (all processes / printed data): scans 600 JPEG 3.4 GB / 665 MB; dense text
  600 PNG 1.8 GB / 105 MB (62 s), 600 JPEG 1.9 GB / 219 MB (20 s); old 300 JPEG text 1.0 GB / 87 MB, scans 1.8 GB / 215 MB.
  Chromium keeps the sheets' encoded data, not every decoded bitmap, so the cost follows the bytes, not the page count.
  The user's real reports at 600 dpi JPEG 0.92 (every page measured): 1.6–2.4 MB a page on average (0.3–3.9), so a
  200-page report ≈ 315–480 MB; a 200-page job of 380 dpi sheets (390 MB) peaked at 2.2 GB for all processes.
- So: sheets are **JPEG 0.92 at 600 dpi** (the office printers' own resolution; at 600 dpi JPEG's fuzz is half today's
  size), unless the job would be too heavy. **Smart check:** before printing, up to 3 sample sheets (first, middle, last)
  are drawn at the top resolution and the job's data is estimated as their average size × the number of sheets. Up to
  **500 MB** (so the user's 200-page reports still print at 600 dpi; ~3 GB at the peak) → the top resolution; above it
  the resolution goes down just enough (data grows with dpi²): `dpi = floor(top × √(500 MB / estimate))`, never below **150**. Sample sheets drawn at the resolution finally used are
  reused, not drawn twice. A sheet never passes 64 MP (pdfops.js's limit: past it a canvas fails or eats gigabytes), so
  A3's top resolution is 575 dpi.
- Pure and exposed like `pickPages`: `SastraPrint.printTopDpi(paper) → dpi` (600, or less where 64 MP binds) and
  `SastraPrint.printDpi(paper, sheets, sampleBytes[]) → dpi`.
- Everything else stays: pdf.js `intent:'print'`, grey mode, landscape sheets turned onto portrait paper, the summary,
  Cancel.
- **Save as PDF** is not changed (300 / 150 dpi JPEG) — a 600 dpi PDF would be several times bigger, and it is made to
  be sent, not printed.

## Not in this work
- Vector printing (not possible through Electron's printing, see above).
- A sharper Save as PDF, a print quality setting.

## Testing
- **sharp-screen** (Playwright, the Khmer report + ten.pdf): page canvases are opaque (`getContextAttributes().alpha`
  false) and 1 : 1 at 100 % / fit width / 125 %; at 800 % (past the 4800 px limit) the canvas is transparent; a capture
  of a text block shows LCD colour (R ≠ B on edge pixels) where Windows' ClearType is on; thumbnails stay grey;
  Present's canvas is opaque and 1 : 1; with `--force-device-scale-factor=2.5` the canvas is 2.5 × its CSS size (no
  cap). Close-ups of the Khmer report are saved for the user, who compares them with Acrobat.
- **print** (sharp-print-test.js, main's `print` swapped for a recorder): `printTopDpi` / `printDpi` table (600, A3 575,
  the 500 MB edge, step-down, the 150 floor); a real 10-page run sends 600 dpi sheets; Save as PDF still 300 dpi.
  print-memory-test.js (`printToPDF` recorder, minutes): 200 realistic text pages stay at 600 dpi, 50 heavy scans step
  down and still print. Then the existing print 71 and print-screen 38 checks.
- On paper (the user): one Khmer page from Acrobat and from Sastra PDF on the same printer.

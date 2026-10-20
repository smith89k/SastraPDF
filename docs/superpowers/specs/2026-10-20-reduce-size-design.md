# Reduce file size: Save button list and File Explorer menu — design

Date: 2026-10-20 · Status: approved by the user ("Yes, go ahead"); built 2026-10-20 (plan 2026-10-20-reduce-size.md).

The user's words: "save button with dropdown (save, save as, save reduce file size)" and "right click to reduce file size
(filename_reduced.pdf)". The right-click is the **File Explorer** menu (the user's choice over the app's own right-click
menu). How to shrink: "check acrobat function" — so this follows Acrobat Pro's *Reduce File Size* (File › Save as Other ›
Reduced Size PDF): it resamples and recompresses pictures, packs the file's structure, throws away unused parts, and
asks nothing about quality. Acrobat also unembeds the 14 standard fonts and subsets fonts; that part is left out (pdf-lib
can't subset a font already in a PDF, and Word already embeds subsets).

## Today
- `#bSave` (menubar, after Open) → `saveActive` (Ctrl+S: writes `d.path`, else Save As); `saveAsActive` (Ctrl+Shift+S)
  → `desk.saveDialog(name, bytes, 'save', d.saveDir)`. ☰ File has Save and Save As….
- Explorer menu (menu.cpp `Act`): Make PDF / Combine N files / — / Split here / Split to … / — / Images here / Images
  to …; Split and Images go to the task window (app/task.js `batch`: open each PDF, one Replace / Keep both question
  via `name-clashes` / `resolve-names`, write each file, problems listed). The sparse and Store manifests only register
  the one verb (the CLSID) per file type; the sub-entries live in the DLL, so a new entry needs **no manifest change and
  no menu package version bump** (no new UAC prompt).

## A. The shrinking: app/reduce.js (`window.SastraReduce`)
One shared classic script, loaded by index.html and task.html (after pdf-lib), so both make the same file.

`SastraReduce.reduce(bytes, { onStep, isCancelled }) → { bytes, before, after }`, `bytes` = null when the result is not
at least 1 % smaller than the original. Throws an error with `.reason` `'protected'` (encrypted) or `'damaged'` (pdf-lib
can't read it). `onStep({ i, n })` is called before each picture; `isCancelled()` is checked between pictures (a cancel
throws `.reason 'cancelled'`). `SastraReduce.reducedName('Report.pdf')` → `Report_reduced.pdf` (any `.pdf` case
stripped; a name without it just gets `_reduced.pdf`).

1. **Load** with pdf-lib (`ignoreEncryption:true, updateMetadata:false`); encrypted → `'protected'`.
2. **Where each picture is used**: for every page, walk its resources' XObjects (and those of Form XObjects inside,
   recursively, guarding against loops) and note, for each image, the longest side of the largest page it appears on
   (points). Images found nowhere (used only in annotations, patterns…) get the document's largest page.
3. **Which pictures**: image streams (`/Subtype /Image`) that are
   - 8 bits per component, not `/ImageMask`, no `/Mask` (colour-key or stencil), no real `/Decode` (an identity one,
     as pdf-lib writes on soft masks, counts as none and is dropped);
   - `DCTDecode` (JPEG) or `FlateDecode` (with no predictor or a PNG predictor ≥ 10), a single filter;
   - colour space `DeviceRGB`, `DeviceGray`, or `ICCBased` with N = 3 (CMYK, Indexed, Lab, grey `ICCBased`, JPEG 2000,
     JBIG2 and CCITT pictures, and JPEGs with `/ColorTransform 0`, are left exactly as they are);
   - stored in at least 20 KB (small icons and logos are never touched).
4. **New size** (Acrobat's usual rule): if the picture is sharper than **225 ppi** when stretched across its page's
   longest side, it is resampled to **150 ppi** on that side, keeping its shape; otherwise its size stays.
5. **Re-encode**: JPEG decoded by Chromium (`createImageBitmap`) after the payload of its EXIF and ICC segments is
   zeroed (PDFs ignore both, and Electron 44 applies EXIF orientation even with `imageOrientation:'none'`), Flate
   pixels decoded by pdf-lib's `decodePDFRawStream` plus the PNG un-filter, resized in the same step
   (`resizeQuality:'high'`), drawn on an `OffscreenCanvas` and saved as JPEG at quality **0.75** (Acrobat's "medium").
   The new picture is stored as `DCTDecode`, 8 bits. RGB pictures keep their colour space (`DeviceRGB` or the same
   `ICCBased` reference; the values are not converted); `DeviceGray` becomes a `DeviceRGB` JPEG (gray-looking), with
   no `/Decode`; the dictionary's other keys (`/Intent`, `/Interpolate`, `/SMask`, `/Metadata`…) are kept. Order of
   the work: unreferenced objects are pruned before the pictures are made, streams with no filter are Flate-compressed
   after.
   - A transparency mask (`/SMask`) of a resized picture is resized to the same size and kept lossless (Flate), so the
     edges stay clean. If the mask can't be read, the picture is left alone.
   - The new picture replaces the old one only when it is **at least 10 % smaller**; a picture that fails in any way
     is left as it was (no error).
6. **Packing and clean-up**:
   - streams with no filter (content streams, fonts…) are Flate-compressed — except XML `/Metadata` streams, which
     tools and PDF/A expect to read as plain text;
   - page thumbnails (`/Thumb`) and other programs' private data (`/PieceInfo`, Illustrator's editing copy) are removed
     from the pages and the catalog;
   - objects nothing points to any more (walked from the trailer's Root / Info) are dropped;
   - saved with object streams (`useObjectStreams:true`).
   Text, fonts (Khmer included), lines, links, bookmarks, form fields and comments are not changed.
7. **Never bigger**: if the result is not at least 1 % smaller, `bytes` is null and nothing is written anywhere.

Pictures are done one at a time and each bitmap is closed at once, so a 500-page scan doesn't fill memory.

## B. The Save button with a list (index.html)
- The menubar's Save becomes a **split button** like Acrobat's: `#bSave` stays exactly as it is (icon + "Save", Ctrl+S),
  and right next to it a narrow chevron button `#bSaveMore` (`aria-haspopup="menu"`, title "More ways to save") opens a
  small list under it, drawn like the page-area right-click menu (`.cmenu`, keyboard: ↑ ↓ Enter Esc):
  - **Save** — Ctrl+S
  - **Save As…** — Ctrl+Shift+S
  - **Save as Reduced Size PDF…**
- The pair is one unit on screen (`.splitbtn`: shared border/hover, a thin line between them). `#bSaveMore` is
  disabled with `#bSave` (no PDF, busy) and hidden whenever `#bSave` is (maximized). The label shedding thresholds of
  the logo row are re-measured, since the chevron takes room (CLAUDE.md "Layout").
- **Save as Reduced Size PDF…** (`saveReducedActive`) works on the open file as it is now (unsaved edits included):
  1. `busy('Reducing file size…')`, the status bar showing "Reducing file size · picture 3 of 40";
  2. not smaller → toast "<name> is already as small as it can be — no copy made", nothing else;
  3. else the Save dialog (`desk.saveDialog(reducedName, bytes, 'reduced', folder)`; main.js titles kind `'reduced'`
     "Save as Reduced Size PDF" and remembers it as the save folder). It ALWAYS starts in the open file's own folder
     (the user, 2026-10-20: "same save as open directory the same opened file") — `d.path`'s folder, not the remembered
     save folder; a file with no path yet (Combine result, split part) uses `d.saveDir`, else the remembered one;
  4. saved → toast "Saved Report_reduced.pdf · 12.4 MB → 3.1 MB (75 % smaller)". The open tab stays the original file
     (not switched to the copy, its dirty state unchanged).
  Protected / damaged → error toast "Couldn't reduce <name>: it's password-protected" / "…: it may be damaged".
  Plain browser (no `desk`): the copy is downloaded.
- ☰ File gets **Save as Reduced Size PDF…** after Save As… (main.js sends `saveReduced`). No keyboard shortcut.

## C. File Explorer: Sastra PDF ▸ Reduce file size
- menu.cpp: `Act::Sep3, Act::Reduce` after Images to …; title **"Reduce file size"**; shown when the selection has at
  least one PDF (the separator too); task name **`reduce`**; it gets the PDFs only (like Split / Images).
- explorer-menu.js `TASKS` gets `'reduce'`; main.js sends it to the task window like Split / Images. scripts/menu-sources
  .js keeps its checks (CLSID, versions) — no manifest or `PKG_VERSION` change.
- app/task.js, task `reduce`: for each PDF `<name>_reduced.pdf` in the PDF's own folder. Opening checks happen in
  `SastraReduce.reduce` itself (no separate page count). The usual ONE "already there" question for the whole click
  (Replace / Keep both / Cancel) is asked first, from the names alone. Then per file: "Reducing Report.pdf" · "Picture 3
  of 40" with the bar filling by pictures; written at once.
  - Not smaller → listed in the window: "Report.pdf is already as small as it can be — no copy made" (it keeps the
    window open, like problems). Protected / damaged / can't write → listed as problems the usual way.
  - Done line: "Done · 2 files saved · 18.6 MB → 4.9 MB" (totals of the files written), then the window closes after
    2 s as today.
  - Cancel stops after the current picture; a half-made file is never written.

## Not in this work
- A quality choice (Acrobat's Reduce File Size has none; its separate PDF Optimizer does — not asked for).
- Font subsetting / unembedding, black-and-white (1-bit) pictures, CMYK pictures, JPEG 2000 / JBIG2.
- Reducing from the app's own right-click menu (the user chose File Explorer).

## Testing
Test PDFs made by a script: a 300 dpi full-page A4 scan (JPEG), a PNG photo with transparency, a page with a small logo
(< 20 KB), a CMYK JPEG, a text-only PDF, a password-protected PDF, plus the user's Khmer Word PDFs (`PAS … _KH.pdf`).
- **reduce** (Playwright in the app's page, calling `SastraReduce` directly): the scan comes out smaller with its
  picture at 150 ppi (1240 × 1754 for A4); the transparent photo keeps its mask; logo and CMYK pictures unchanged
  byte for byte; text-only → `bytes` null; protected → `'protected'`; the Khmer PDFs: pdf.js text content identical
  before and after, every page renders to nearly the same pixels; every result opens in pdf.js and pdf-lib.
- **save-menu** (Playwright, from source): the chevron opens the list (mouse and keyboard), Save / Save As run the same
  as the button and shortcuts, both buttons disabled with no PDF and hidden while maximized; Save as Reduced Size PDF
  with main's `save-dialog` swapped for a recorder: the suggested name and folder, the toast, the tab unchanged; the
  text-only file → the "already as small" toast and no dialog. ☰ File's new item does the same.
- **reduce-menu** (Playwright on the task window, as menu-test does): two PDFs → two `_reduced.pdf` files; a name already
  there → the question, Keep both → "(2)"; not smaller → the line, no file; Cancel.
- **DLL harness**: "Reduce file size" shown for PDFs (alone or mixed with pictures), not for pictures only; the list file
  carries the PDFs only.
- Then the old suites that touch the menubar and Save (titlebar, controls, close, folders, menu).

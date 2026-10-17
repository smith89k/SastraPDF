# Pictures in the Explorer menu — design

Date: 2026-10-17 · Status: approved by the user in chat

## Goal
Pick pictures (and PDFs) in File Explorer → right-click → **Sastra PDF ▸ Combine N files** puts them all
into one PDF; one picture → **Make PDF**. It builds on the Explorer menu of 2026-10-15
(`2026-10-15-explorer-menu-design.md`): same DLL, package, list file, `--sastra-task=combine` and
`combinePaths`.

## User's choices (chat, 2026-10-17)
- Combine takes **pictures and PDFs together**, in name order (as Explorer sorts: 01, 02, 10).
- Each picture page is **the picture's own size** (no white edge, no A4 fitting).
- **One picture** → "Make PDF".
- The result **opens in Sastra PDF** as an unsaved tab (like Combine today); Save starts in the files' folder.
- Types: **JPG (.jpg .jpeg .jfif), PNG, BMP, GIF, WebP.** HEIC and TIFF were asked for, then dropped
  ("rare file, leave it").

## What the user sees

| Selection (counting only PDFs and pictures) | Menu under Sastra PDF |
|---|---|
| 1 picture | **Make PDF** |
| 2+ files, any mix | **Combine N files** (N = PDFs + pictures) |
| … with at least one PDF | + separator, Split and Images items as today — they act on the PDFs only |
| no PDF and no picture | root hidden (as today) |

- Make PDF → new tab named after the picture (`photo.jpg` → `photo.pdf`); Combine → `Combined.pdf`.
  Both unsaved (dirty); `d.saveDir` = the first file's folder.
- Toasts: "Made photo.pdf · 1 page", "Combined 5 files · 23 pages". Unreadable files are skipped and named
  ("Couldn't read: a.webp, b.pdf"); the rest still go in. Nothing readable → error toast, no tab.
  (Today Combine refuses when fewer than 2 PDFs are readable; that rule goes — one good file is enough.)
- Installing this update asks the admin "Yes" (UAC) once on Windows 11: the menu package's manifest
  changes, so its version goes up (`1.0.0.0` → `1.1.0.0`).

## Picture → page (new `app/images.js`, classic script, `window.SastraImages`)
- **Type from the content**, not the name (magic bytes): PDF `%PDF`, JPEG `FF D8 FF`, PNG `89 50 4E 47`,
  GIF `GIF8`, BMP `BM`, WebP `RIFF….WEBP`. A PNG named `.jpg` works; anything else → unreadable.
- **JPEG**: embedded as-is with pdf-lib `embedJpg` (no re-compression; grey, RGB and CMYK). EXIF
  orientation (tag 0x0112, values 1–8) is applied with a transform matrix when drawing; for 5–8 the
  page's width and height swap. A broken EXIF block is ignored (orientation 1).
- **PNG**: pdf-lib `embedPng` (lossless; transparency kept as a soft mask, white page behind it).
- **BMP, GIF, WebP**: decoded by Chromium (`createImageBitmap`, first frame for GIF/animated WebP),
  drawn on a canvas, re-encoded as PNG (lossless), then `embedPng`. Pictures larger than the canvas
  limit fail as unreadable.
- **Page size** = pixels × 72 / dpi points. dpi from the file: JPEG JFIF APP0 density (units 1 = dpi,
  2 = dots/cm), else EXIF XResolution + ResolutionUnit; PNG `pHYs` (unit 1 = metre); BMP header pixels per
  metre. No usable value (missing, 0, under 10 or over 10 000 dpi) → **96 dpi**. Typical phone photo
  (4032 × 3024 at 72 dpi) → 56 × 42 inches; zoom and Print's "fit" handle that.
- **PDF limit**: if a side would exceed 14 400 pt (200 in, the limit most PDF readers keep to), the page is
  scaled down to fit; the image keeps all its pixels.
- Pure helpers exposed for tests: `kind(bytes)`, `jpegInfo(bytes) → { orientation, dpi }`,
  `pngDpi(bytes)`, `bmpDpi(bytes)`, `pageSize(w, h, dpi, orientation)`; plus
  `addImagePage(pdfDoc, bytes) → Promise<{ width, height }>` (throws on unreadable).
- No new library: pdf-lib and Chromium do the work, so About's credits don't change.

## Changes to existing parts

### 1. Menu DLL (`explorer-menu/menu.cpp`)
- `PdfPaths` becomes a selection scan returning the supported paths with their kind (PDF / picture,
  by extension: `.pdf .jpg .jpeg .jfif .png .bmp .gif .webp`, case-insensitive).
- New item **Make PDF** (`Act::MakePdf`, task `combine` with the one path). `GetState`: Make PDF shown only
  for exactly 1 supported file that is a picture; Combine for 2+ supported files; Split/Images and their
  separators only when there is at least one PDF; root hidden when there are no supported files.
- Invoke: Combine and Make PDF send all supported paths; Split/Images send only the PDFs.

### 2. Package manifest (`explorer-menu/AppxManifest.xml`)
- One `desktop5:ItemType` per extension above, each with the same Verb/CLSID. Version `1.1.0.0` (also
  `PKG_VERSION` in explorer-menu.js; the build script checks they match). Description: "… for PDF files and
  pictures".
- With a mixed selection Windows builds the menu from the right-clicked item's type; since every included
  type is registered, the menu shows whichever file is right-clicked, and `Invoke` gets the whole selection
  (to confirm on the real menu).

### 3. Classic registration (`explorer-menu.js`)
- `verbKey` per extension: `SystemFileAssociations\<ext>\shell\SastraPDF` for each type (same values:
  `ExplorerCommandHandler`, `MultiSelectModel` Player). `unregisterClassic` deletes all of them;
  `classicRegistered` checks all of them (a 1.0.x install has only `.pdf`, so an update re-registers).
- `readTaskList` keeps existing absolute paths with any supported extension (it was `.pdf` only).

### 4. main.js
- No change to the flow: `combine` → `combine-paths` with the sorted list. ("Open with" stays PDF-only.)

### 5. index.html
- Loads `images.js`. `combinePaths(paths)`: per file, `SastraImages.kind` → PDF pages copied as today,
  picture → `addImagePage`; skip-and-name unreadable ones; tab name `<base>.pdf` when the list has one
  file, else `Combined.pdf`.

## Testing
- **DLL harness** (the 2026-10-15 one, extended): 1 picture → only Make PDF; 2 pictures → Combine 2 files,
  no Split/Images; picture + PDF → Combine 2 + Split/Images; Invoke list contents per item; upper-case
  and Khmer names.
- **Unit** (explorer-menu.js, test registry key): `readTaskList` accepts pictures, drops other types;
  classic keys for every extension written, found and removed.
- **Unit** (images.js in the page): `kind`, `jpegInfo` (orientations 1/3/6/8, JFIF dpi, EXIF dpi, broken
  EXIF), `pngDpi`, `bmpDpi`, `pageSize` (96 dpi default, swap for 5–8, 14 400 pt cap).
- **Playwright** (`npm start` and `dist\win-unpacked`): `--sastra-task=combine` with generated pictures —
  JPEG with EXIF orientation 6 (page is portrait, top of the picture at the top: pixel colours checked),
  PNG with transparency + pHYs 300 dpi, BMP, GIF, WebP, a broken file, two PDFs → one tab, pages in name
  order, sizes as expected; 1 picture → tab `name.pdf`; nothing readable → error toast; earlier menu,
  folder, print and close checks still pass.
- **Real menu with the user** (UAC Yes): right-click 1 picture → Make PDF; pictures + PDFs → Combine;
  right-click on a picture and on a PDF of the same mixed selection; "Show more options" path once.

## Docs
CLAUDE.md (Explorer menu, layout: images.js), README (pictures in the menu), HISTORY.

## Not in scope
Pictures from inside the app (Open, Insert, the Combine panel, drag and drop); HEIC; TIFF; A4 fitting.

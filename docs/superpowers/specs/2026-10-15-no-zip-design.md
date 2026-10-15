# No ZIP files: Split and Export save to a folder — design

Date: 2026-10-15 · Status: approved by the user in chat

## Goal
The user doesn't want ZIP files. Split and Export as images save separate files instead.

## Behaviour
- **Split document** → Output: **New tabs** (unchanged) | **Save to folder** (`state.splitOut` `'tabs' | 'folder'`).
  Save to folder: pick a folder first, then each part is made and written as its own PDF, named as
  before (`<name>-<range>.pdf`).
- **Export as images**: one page → the Save dialog as now. Two or more → pick a folder first, then
  each page is drawn and written as its own file (`<name>_page-01.png`). Hint: "10 pages → 10 image
  files in a folder you choose."
- Asking for the folder **before** any work: nothing is drawn if it's cancelled, and each file is
  written as soon as it's made (no big bundle in memory, unlike the ZIP).
- **Names already in the folder** (checked in main): one native question — **Replace**, **Keep
  both** (default; new files get " (2)", " (3)"… before the extension), **Cancel** (nothing
  written). Two parts with the same name in one batch (ranges `1-2, 1-2`) are numbered the same way.
- Toast: "Saved 4 PDF files in <folder name>". Plain browser (no `desk`): one download per file.

## Code
- main.js `pick-folder` ({ title, names }) → `showOpenDialog` (openDirectory, createDirectory,
  starts in `lastDir` / Documents, button "Save here"); only base names are used; returns
  `{ dir, names }` (final names) or `null`. Sets `lastDir`. preload `pickFolder(title, names)`.
  Files are written with the existing `write-file`.
- index.html `saveMany(names, what, label, make)` used by `split` and `exportImages`.
- **JSZip removed**: script tag, `CREDITS` row and note (JSZip's lie, readable-stream, setimmediate
  go; pdf-lib's UPNG, tslib and pako stay), package.json devDependency (+ lock), copy-vendor.js,
  check-credits.js, main.js `zip` file-type name, README, CLAUDE.md.

## Testing (Playwright, outside the project; main's dialogs stubbed)
Split every 3 pages of a 10-page PDF to a folder → 4 PDFs with the right page counts; again →
question shown ("4 of these files…"), Keep both → `(2)` files, Replace → no new files, Cancel →
nothing written; cancelled folder pick → nothing written, app not left busy. Export 10 pages →
10 PNGs; one page → Save dialog. No "ZIP" in the Tools panel, `JSZip` undefined, About without
JSZip, no console errors. The print tests still pass.

# Drop files into the Pages panel, and move pages between open files — design

Date: 2026-10-19 · Status: approved by the user ("ok").

The user's words: "i need drag pdf or image file to place in openned pdf file in page panel like moving page", then
"and move page cross file". Pictures dropped between pages get **the picture's own size** (the user's choice over "the
size of the pages next to it"), as Make PDF from the right-click menu. Moving to another file goes through its tab
(hover to open it, as browsers and Acrobat); "move" as asked, Ctrl while dropping = copy.

## Today
- Pages panel (`renderThumbs`): dragging thumbnails reorders pages (`dragFrom = { docId }`, red line
  `.drop-before/.drop-after`, `movePages(ins)` → one `commit`, Ctrl+Z undoes it). Only the active file's pages are shown.
- Files dropped anywhere (`window` drop) → `openFiles`: PDFs open in new tabs; anything else → toast "Choose PDF files".
  While files are over the window, `.dropping .viewer::after` says "Drop PDFs to open them in new tabs".
- Organize pages › Insert file (`#oInsert` → `#fInsert`, PDFs only) → `insertFiles`: pages after the current page.
- app/images.js `SastraImages.addImagePage(doc, bytes)` appends a picture as a page at its own size (dpi from the file,
  else 96; EXIF orientation applied); `kind(bytes)` tells PDF and the picture types apart by content.

## A. Files from File Explorer dropped on the Pages panel
- **Where:** while files are dragged over the Pages panel (`#thumbs`) and a PDF is open, the red line shows where they
  go, as for moving pages: before / after the thumbnail under the mouse (its middle decides), at the end when the mouse
  is below the last thumbnail, at the start above the first one. Over the panel the viewer's dashed "Drop PDFs…" box is
  hidden (`.dropping-pages` on `#app`). Dropping there never reaches the window handler (no new tabs).
- **What:** PDFs add all their pages; pictures (.jpg .jpeg .jfif .png .bmp .gif .webp — the right-click menu's types,
  told apart by content with `SastraImages.kind`) add one page each at the picture's own size, the right way up.
  `addImagePage(doc, bytes, at)` gets an optional index (`doc.insertPage(at, …)`; without it, as now, at the end).
- **Several files:** in name order like File Explorer (`Intl.Collator(undefined, { numeric:true, sensitivity:'base' })`,
  as explorer-menu.js), all in one edit: one `commit`, one Ctrl+Z.
- **After:** the new pages are selected, the first one is current and shown; toast "Inserted N pages after page K"
  (or "at the start").
- **Files that can't be used** (password-protected PDF, damaged, not a PDF or a picture) are skipped; one error toast
  names them. None usable → nothing changes.
- **Elsewhere:** dropping on the page area, on the tab row, or with no PDF open works as today (PDFs open in tabs). The page area's
  dashed box, when a PDF is open, adds "or drop on the Pages panel to add them".
- **Insert file** (`#fInsert`): `accept` also takes the picture types, and it uses the same code (after the current
  page, name order).
- One function does the work for both: `insertItems(d, at, items)`, items `{ name, bytes }`, under
  `busy('Inserting pages…')`.

## B. Moving pages to another open file
- **Start:** dragging thumbnails as today; `dragFrom` becomes `{ docId, pages }` (the selection at dragstart, sorted), and
  `effectAllowed` is `copyMove`.
- **Reaching the other file:** over another file's tab the tab is highlighted; held there 500 ms, that tab opens
  (`activate`) and its Pages panel takes the drop with the red line as in A. Dropping on a tab itself adds the pages at
  the end of that file. The source file's own tab does nothing.
- **Move (default):** the pages are copied into the target at the line (pdf-lib `copyPages` from the source's bytes)
  and committed, then removed from the source and committed there — each file gets its own undo step, both are marked
  changed, nothing is saved. If the target edit fails, the source is untouched.
- **Ctrl held at the drop = copy:** the source keeps its pages (`dropEffect` shows the + cursor).
- **Every page of the source moved:** a PDF needs at least one page, so they are copied instead; the toast says so
  ("Copied 5 pages to B.pdf — A.pdf keeps them: a PDF needs at least one page").
- **After:** the target stays open with the new pages selected; toast "Moved 3 pages to B.pdf" / "Copied …".
- **Ending the drag cleanly:** opening another tab re-renders the Pages panel, so the dragged thumbnail is gone from the
  page before the drop and its own `dragend` may never fire. `dragFrom` is also cleared on any drop, on a `dragend`
  caught at the window, and at the next `dragstart`, so a later file drop is never taken for a page drag.
- Within one file nothing changes (drag = move; no Ctrl copy there). Maximized hides the Pages panel: no page dragging
  then, as today.

## Testing
Playwright on the app (from source, then as usual the other suites that touch the Pages panel and dropping:
controls, titlebar, open-progress, close-check):
- A: synthetic file drops (a `DataTransfer` with `File`s made in the page) on the panel — before/after a thumbnail, below
  the last, above the first; a PDF + JPEG (EXIF-turned) + PNG in name order (`10.png` after `2.jpg`); page count, sizes
  (picture = its own size), selection, one Ctrl+Z restores; a password PDF and a .txt skipped with the toast; drop on the
  page area still opens a tab; no PDF open → opens tabs; Insert file with a picture.
- B: two files open; drag thumbnails onto the other tab (hover 600 ms → it opens), drop at a line → target has the
  pages in place, source lost them, both dirty, Ctrl+Z each; Ctrl-drop copies; drop on a tab = at the end; every page →
  copied + toast; after the drop a file drop on the panel inserts (no stale `dragFrom`).
- images.js: `addImagePage` with `at` inserts there (unit, in the page).
Real drags from File Explorer, by hand on this PC once.

## Not doing
- Ctrl-drag copy inside the same file (duplicate pages).
- Pictures sized to the neighbouring pages (the user chose the picture's own size).
- Dragging pages out of the app (to File Explorer or the desktop).
- Two files side by side.

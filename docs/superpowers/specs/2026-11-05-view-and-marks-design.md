# Smooth hand tool, two-page view, highlight, pen and shapes — design

**Date:** 2026-11-05
**Status:** waiting for the user's read of this document

## Why

The user asked for three things before the 1.4.0 release (the Store update panel is finished and waits on main, not pushed):

1. "when maximize and zoom i can't use hand tool move smoothly to the next page". Maximized shows only one page
   (`#app.focus .page:not(.current){display:none}`), so the hand tool stops at that page's edge. Wanted: "smoothly move cross page".
2. "view in 2 page on screen option (left and right)". Pairs are always 1-2, 3-4 (the user's choice), never a cover page alone.
3. "highlight (hold shift to highlight straight line) and insert shape over the page with option fill and border", then
   "add pen too". After saving, the marks must "stay changeable" (the user's choice).

These are independent; each works without the others, but they all change how pages are laid out and drawn, so build in this order.

## Goals

### 1. Maximized and zoomed in: pages flow

- Page fitted whole: as today, one page at a time; arrows and the wheel flip.
- Zoomed in so the page no longer fits (Ctrl+wheel, Ctrl+=, the zoom keys): every page shows, one after another. Hand-tool
  drag and the wheel move straight across pages with no stop and no flash. The current page follows the view.
- Arrow keys while zoomed in jump to the next or previous page.
- Back to fit (Ctrl+0): one-page view again, on the page reached. Going either way the page in view must not jump away.
- Restore still returns the zoom from before Maximize.

### 2. Two-page view

- A button in the view toolbar switches one page / two pages; also the right-click menu and ☰ View. Remembered across starts
  (localStorage), for every file.
- Pairs always 1-2, 3-4; an odd last page sits on the left with an empty space on its right.
- Fit width and Fit page fit the pair. Pages of different sizes in a pair stay at the same zoom, aligned to the pair's middle gap.
- Maximized fitted: both pages together, arrows and wheel move two pages. Maximized zoomed in: pairs flow as in goal 1.
- Normal view: Prev/Next and PageUp/PageDown move two pages. Typing page 4 shows the pair 3-4, and page 4 is the current page.
- Present stays one page at a time. Thumbnails, selection, printing and exports don't change.
- The row's narrowing steps (CLAUDE.md "Layout") must be re-measured, since this adds a button.

### 3. Highlight, pen and shapes

**Tools.** A new "Draw" section in the Tools panel (foldable like the others), with its own row of buttons: Highlight, Pen,
Rectangle, Circle, Line, Arrow. Under it the options for the chosen tool:

| Tool | Options |
|---|---|
| Highlight | colour, thickness; see-through so words show (multiply) |
| Pen | colour, thickness |
| Rectangle, Circle | fill colour or no fill; border colour or no border; border thickness |
| Line, Arrow | colour, thickness |

- Highlight and pen are free-drawn: they work on anything, scanned pages included. They do not snap to words.
- Shift while drawing: highlight and pen keep a straight line (start point to the mouse); a line or arrow stays level or at 45°; a
  rectangle stays square and a circle round.
- The tool stays on after drawing. Esc returns to the Select tool. Space or the middle mouse still pans.
- The tool remembers its last colours and thickness across starts.

**Changing marks.** With the Select tool, click a mark to select it: handles show; drag to move; drag a handle to resize; the
Draw options then show and change that mark; Delete removes it. Clicking anywhere else on a page selects the page as today.

**Undo.** Ctrl+Z / Ctrl+Y cover marks and page edits in one history, in order.

**After saving.** Marks are real PDF annotations, each with its own appearance:

- They reopen here still changeable.
- They show in Acrobat and other PDF readers, and can be changed or deleted there.
- They print, and appear in exported images, Save as PDF on the print screen, Present, thumbnails and Maximized.
- They stay with their page through rotate, reorder, delete, split, extract, combine, drag between files and Reduce file size.
- They count as unsaved changes: the tab's dot and the close question.

## Non-goals

- Text boxes, sticky notes, stamps, signatures, and snapping highlights to words.
- Changing annotations made by other apps. They keep showing and stay as they are, never selectable here.
- See-through (opacity) options for fill. Solid only, except the highlight.
- Drawing while Maximized: the Tools panel is hidden there, so Maximize switches back to the Select tool. Marks still show.
- A cover-page option in two-page view (the user chose 1-2, 3-4).

## Anti-goals (a failure even if it works)

- A pen stroke that lags or makes the page flash: drawing must feel instant, also in a 900-page or 30 MB file.
- Delete removing a page while a mark is selected.
- Marks shifted or stretched on a rotated page, or a page with a crop box or an origin other than 0,0.
- Marks lost by any action that writes or copies pages, or missing from print or exports.
- A saved file that Acrobat refuses or shows differently from here.
- A file with no marks changing in any way: same bytes unless the person edits it, same look, same speed.
- A slower or broken normal one-page view.

## How it fits the code (the builder may choose differently within the goals)

- Every page edit today goes through pdf-lib → `commit(d, bytes)` → `reload()`, which re-opens the file and redraws everything. That
  is fine for a rotate but far too slow for a pen stroke, and undo keeps a full copy of the bytes (up to 40). So marks need
  their own in-memory list per document, drawn on top of the page, written to the PDF only when bytes are needed (Save,
  print, export, split and so on, in one place). An undo step for a mark must not copy the file.
- pdf.js draws saved annotations into the page canvas, so a mark being edited would show twice. The working copy should hold no marks
  of ours: take them out on open (only for files that have them; finding that out must be cheap) and put them back on the way out.
- Identify our own marks with a private key in the annotation, so other apps' annotations are left alone.
- Suggested PDF forms: pen and highlight `/Ink`; rectangle `/Square`; circle `/Circle`; line and arrow `/Line` (arrow with `/LE`). Each with `/AP` so every reader
  draws the same, `/F 4` so it prints, and the matching `/C`, `/IC`, `/BS`. Highlight's appearance uses a multiply `ExtGState`.
- `print.js` and exports render from `doc.pdf`, so they need a version with the marks in it.
- Coordinates: use the pdf.js viewport's conversions, so rotation and crop boxes come out right.

## How to check

- Playwright in a scratch test folder, as the project's other suites: flow on and off in Maximized, no page jump, hand drag across a
  page boundary; two-page layout, navigation, odd last page, different page sizes; every tool, Shift, select, move, resize, change,
  Delete, undo across marks and page edits.
- Save, reopen: marks changeable, geometry the same to within a small tolerance. Rotated and cropped test pages.
- Each output carries the marks: print output (`printToPDF`), export image pixels, split, extract, combine, drag to another file, Reduce.
- A file with no marks: Save writes the same output as before this work; open, zoom and scroll are not slower.
- Instant drawing: a stroke on a large file doesn't run `commit` or `reload`.
- Old suites that remain, the update panel suite, and a real Acrobat check by the user (a saved file with every mark type).

## Settled in the builder check (my calls, the user said "finish it")

- **Signed PDFs:** drawing and saving are allowed, as page edits are today, but the first mark on a file with a digital signature
  shows a toast saying that saving changes will break the signature. Keeping signatures valid would need a separate way of writing files.
- **Protected PDFs (encrypted, open with no password):** the Draw tools refuse with a message, before anything is drawn, as Reduce
  does. pdf-lib can't write them safely.
- **Files with marks of ours that are protected or signed:** never taken apart on open: their bytes stay as they are, and those marks stay part of the page.
- **A mark changed in Acrobat:** it stays ours while its private tag survives. The standard keys (`/Rect`, `/InkList`, `/L`, `/C`, `/IC`, `/BS`)
  are the truth; the tag only says which kind it is. Its text (`/Contents`, `/T`, `/Subj`, dates) is kept. If Acrobat drops the tag or the marker,
  the mark is treated like any other app's. A highlight recoloured in Acrobat may lose its see-through look; that is Acrobat's redraw, and accepted.

## Calls made in writing this up (not asked of the user)

- Flow begins when the page no longer fits; it does not begin at a small zoom below fit.
- Normal-view Next moves two pages in two-page view.
- No drawing while Maximized.
- Other apps' annotations are never selectable.
- Solid fills, no opacity option.
- Colour choices and default thicknesses, left to the builder (highlight yellow by default).

## Left to the builder

- Colour picker form, button icons, default thicknesses, handle look.
- Where the marks code lives: a new `app/marks.js` is expected, since `app/index.html` is already large.
- Exact sizes for the row's narrowing steps.

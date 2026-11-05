# View and marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximized + zoomed pages flow under the hand tool; a two-page view (1-2, 3-4); highlight, pen and four shapes saved as real PDF annotations that stay changeable.

**Architecture:** `d.bytes` holds no marks of ours; `d.marks` is an immutable list drawn in an SVG over each page. `marksIn(d)` writes them into bytes whenever bytes leave the working copy, and `loadPdf` takes them back out. A marker in each appearance stream's dictionary (never compressed) makes "does this file have marks?" a plain byte search. Undo entries become `{ bytes, marks }`, so a mark's undo copies no file.

**Tech Stack:** classic scripts, pdf-lib 1.17.1, pdf.js 6.4, playwright-core, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-05-view-and-marks-design.md`

## Global Constraints

- A file with no marks: same bytes, same code path, same speed.
- Delete with a mark selected never removes a page.
- Drawing never calls `commit` or `reload`.
- Keep a Khmer font in any new font stack; no network; the app's own controls.
- No push or release until all three pass.

## Review Focus

- Rotated page or crop box with an origin other than 0,0 → marks stay in place, on screen and in the saved file. Test in Task 3.
- Page edits with marks (rotate, delete, reorder, copy to another file) then undo → marks follow, undo restores both. Test in Task 5.
- Zooming in and out in Maximized at the last page, or on pages of different sizes → no jump, no blank. Test in Task 1.
- Odd page count, and a pair of different page sizes, in two-page view. Test in Task 2.
- A PDF from another app with its own annotations → untouched, not selectable, still drawn. Test in Task 3.

---

### Task 1: Pages flow in Maximized
**Files:** `app/index.html`. **Test:** `t\flow-test.js`.
- [ ] Failing tests: zoom in → all pages shown; drag across a page boundary moves on; current follows; arrow jumps a page; Ctrl+0 → one page on the page reached; page in view doesn't jump either way; wheel scrolls while zoomed and flips when fitted.
- [ ] `flowing()`, `#app.flow`, `setZoom` keeps the anchor. Run. Commit.

### Task 2: Two-page view
**Files:** `app/index.html`, `main.js`. **Test:** `t\two-test.js`.
- [ ] Failing tests: pairs, odd last page, fit modes, Next by two, typing page 4, Maximized pair and flow, Present single, remembered, menu entries, row fits at each width.
- [ ] `state.two`, `#pages.two` grid, `#bTwo`, `stepPage(dir)`. Run. Commit.

### Task 3: Marks in the PDF
**Files:** Create `app/marks.js`. **Test:** `t\unit\marks.test.js`.
**Produces:** `window.SastraMarks = { has(bytes), take(bytes) → { bytes, marks }, put(bytes, marks) → bytes, paint(ctx, marks, viewport), svg(mark), constrain(kind, a, b, shift), bounds(mark), moved(mark, dx, dy), handles(mark), resized(mark, handle, pt) }`. A mark: `{ id, page, kind, pts, color, fill, width }`, in PDF user space.
- [ ] Failing tests: every kind round-trips; rotated and cropped pages; other apps' annotations untouched; file left with no marker after `take`; copyPages keeps marks; geometry helpers.
- [ ] Implement. Run. Commit.

### Task 4: Drawing and changing marks
**Files:** Create `app/draw.js`. Modify `app/index.html`. **Test:** `t\draw-test.js`.
- [ ] Failing tests: each tool draws; Shift; stays on; Esc; select, move, resize, change colour; Delete removes only the mark; no reload during drawing; Space pans; Maximize returns to Select; options remembered.
- [ ] Implement. Run. Commit.

### Task 5: Marks through everything
**Files:** `app/index.html`, `app/print.js` only if needed. **Test:** `t\marks-out-test.js`.
- [ ] Failing tests: Save + reopen; Save As; thumbnails; Present; print and Save as PDF; export image; split; extract; combine; drag to another file; Reduce; rotate; delete; undo across all; close question; a file with no marks saved byte for byte as before.
- [ ] `marksIn`, `{ bytes, marks }` history. Run. Commit.

### Task 6: Finish
- [ ] Update What's new (1.4.0), README, CLAUDE.md, credits unchanged.
- [ ] Final review by a fresh reviewer; fix pass.
- [ ] Local Store package; push (the user's "ok, but store version on local, no github action").

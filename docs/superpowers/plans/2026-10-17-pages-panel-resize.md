# Resizable Pages Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> (2026-10-17: executed inline on main — the user works on main only.)

**Goal:** Drag the Pages panel's right edge to resize it (140–400 px, double-click = 186), remembered, thumbnails fill it — as in Bohpum.

**Architecture:** CSS variable `--pages-w` on <html> drives the panel width and (through `--tw`/`--th` and each box's `--ar`) the
thumbnail size, so a drag only sets one variable; after the drag the thumbnails redraw sharp. Spec:
`docs/superpowers/specs/2026-10-17-pages-panel-resize-design.md`.

**Tech Stack:** CSS custom properties + `aspect-ratio`, pointer capture; Playwright test outside the project.

## Global Constraints
- 140 ≤ width ≤ 400 px, normal 186; storage key `sastra-pages-w`; thumbnail box at 186 px = 128 × 168 max (today's).
- Commit on main. `<S>\t\` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t\`.

### Task 1: Resizable panel
**Files:** `app/index.html` (head script, `.thumbs`/`.tbox` CSS, resizer CSS + element after `#thumbs`, `renderThumbs` /
ghost boxes use `--ar`, `drawThumb` reads `box.clientWidth`, the resize code). Test: `<S>\t\pages-panel-test.js`.

- [ ] Step 1: write `pages-panel-test.js` (the checks in the spec); run → FAIL (no `#pagesResizer`).
- [ ] Step 2: implement:
```js
/* ---------- Pages panel width: drag its right edge (as in Bohpum); double-click = the normal width ---------- */
const PAGES_W = 186, PAGES_MIN = 140, PAGES_MAX = 400;
let pagesW = PAGES_W; try { const w = +localStorage.getItem('sastra-pages-w'); if (w >= PAGES_MIN && w <= PAGES_MAX) pagesW = w; } catch {}
function setPagesW(w){ /* clamp, set or remove --pages-w on <html>, refit() */ }
function savePagesW(w){ /* localStorage set / remove */ }
function redrawThumbs(){ for (const d of state.docs) d.thumbCanvas = []; renderThumbs(); }   // drawn for the old width
// pointerdown on #pagesResizer (left button): capture, body.pages-resizing, move → setPagesW(w0 + dx),
// up → if changed: savePagesW + redrawThumbs; dblclick → setPagesW(null), savePagesW(null), redrawThumbs()
```
- [ ] Step 3: run until PASS; earlier suites (pictures, menu, controls, print-screen, print, close, titlebar, folder, ops) still pass.
- [ ] Step 4: CLAUDE.md (How index.html works: the Pages panel width) + commit `feat: resizable Pages panel, as in Bohpum`.

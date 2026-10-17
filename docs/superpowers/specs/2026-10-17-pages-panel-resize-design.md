# Resizable Pages panel, as in Bohpum — design

Date: 2026-10-17 · Status: approved by the user in chat ("left page panel should be resize the same bohpum" → "Yes, go ahead")
Model: Bohpum src/app.js "Pages panel width: drag its right edge" + src/app.css `#pages-resizer` (140–400 px, double-click =
normal width, remembered, thumbnails fill the panel).

## Behaviour
- The Pages panel's right edge is a 7 px grab strip (`#pagesResizer`, `role=separator`, col-resize cursor, title "Drag to resize ·
  double-click for the normal width"); a 3 px `--accent` line shows on hover and while dragging (`body.pages-resizing`).
- Drag: width 140–400 px (normal 186 px = today's). Double-click: back to normal. The width is kept in localStorage
  `sastra-pages-w` (removed for the normal width) and applied by the head script before first paint (`--pages-w` on <html>).
- Thumbnails fill the panel live: `.thumbs{--tw: calc(var(--pages-w,186px) - 58px); --th: calc(var(--tw) * 1.3125)}`,
  `.tbox{width: min(var(--tw), calc(var(--th) * var(--ar))); aspect-ratio: var(--ar)}` with `--ar` = page w / h (inline) — at
  186 px exactly today's 128 × 168 box. After a drag that changed the width, every document's thumbnail cache is dropped and the
  thumbnails redraw sharp (drawThumb uses the box's laid-out width). The page view re-fits (`refit()`) while dragging.
- Hidden with the panel (`#app.no-thumbs`) and in Maximize (`#app.focus`); in narrow windows (panel over the page) it works the same.

## Testing (Playwright `pages-panel-test.js`, source + packaged)
Normal width 186 and the A4 thumbnail 118.8 × 168; dragging the edge to 300 → panel 300, thumbnail 224.6 × 317.6, sharp redraw
(canvas ≥ 2 × box width), page view re-fitted; past the limits → 400 / 140; double-click → 186 and the setting removed; 260
survives a restart (before any script runs); hidden with the panel and in Maximize; the red line on hover; no console errors.
Earlier suites still pass.

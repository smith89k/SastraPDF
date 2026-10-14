# Sastra PDF (សាស្ត្រា PDF)

An Acrobat Pro–style PDF desktop app for Windows, built with Electron. The name comes from
សាស្ត្រា (sastra), the traditional Khmer palm-leaf manuscripts: each leaf is a page.
The full history of how this project was planned and built is in `docs/HISTORY.md`.

## What the user wants
- An app "closely the same as Acrobat Pro" for working with PDF files:
  combine, split, remove pages, export images.
- Acrobat-like UI: multiple PDFs open as **tabs** along the top, a **hand tool** to drag
  (pan) the page, **maximizing** (page area and window), zoom.
- A **native Windows app** (Electron chosen), not only a web page.
- Branding: **Sastra PDF**, shown with the Khmer script **សាស្ត្រា** next to the name.
- User's environment: Windows, projects live in `E:\_httdocs\`. The user is in Cambodia
  (Asia/Phnom_Penh); Khmer support matters.

## Project layout
    main.js            Electron main: window (opens maximized), menus, file dialogs,
                       single-instance lock, "Open with" (.pdf argv), close confirmation
    preload.js         contextBridge API `window.sastra` (open/read/write/save dialog,
                       menu events, close request, setTheme, webUtils.getPathForFile)
    app/index.html     The whole app UI + PDF logic in one file (HTML/CSS/JS, no build step)
    app/vendor/        pdf.min.js, pdf.worker.min.js, pdf-lib.min.js, jszip.min.js
                       — filled by `scripts/copy-vendor.js` on `npm install` (gitignored)
    scripts/ensure-electron.js  postinstall: unpacks electron.exe with Windows tar.exe when
                       Electron's own installer silently fails (see gotchas)
    build/logo.png     Logo master, 1024 px: red rounded tile, bound palm leaves (sastra)
                       turning into a white page marked "PDF" (Inter Black), សាស្ត្រា below.
                       Made from the user's root logo.png: stray red pixels cleared, cropped,
                       and its Adobe-Acrobat-like red swirl "A" replaced by "PDF" (trademark).
                       Use build/logo.png, not the root original, for any new icon sizes.
    build/icon.ico|png App/installer icon made from logo.png (.ico: 16–256 px, PNG entries;
                       .png: 512 px window icon)
    app/logo.png       64 px logo for the menubar brand mark and favicon (web/index.html
                       embeds the same image as a data URI)
    app/author.jpg     200 px photo of the author (Sunnguon Taing), from their LinkedIn profile,
                       for the About screen (web/index.html embeds it as a data URI)
    build.bat          npm install + npm run dist, then opens dist\  (CRLF line endings)
    run.bat            npm install if needed, then npm start  (CRLF line endings)
    web/index.html     Browser-only version (libraries from cdnjs, includes sample PDFs)

## Tech choices
- Rendering: **pdf.js 3.11.174** (UMD build `pdfjsLib`; worker also loaded as a script tag so
  pdf.js can fall back to the main thread if a Worker can't start from file://).
- Editing: **pdf-lib 1.17.1** (merge, split, reorder, rotate, delete, insert).
- ZIP output: **JSZip 3.10.1**.
- Electron **33.2.1**, electron-builder **25.1.8**, NSIS installer (not one-click, choose dir,
  desktop + Start menu shortcuts), `.pdf` file association. appId `kh.sastra.pdf`.
- Security: contextIsolation on, nodeIntegration off, sandbox on, CSP meta in app/index.html.
- Licensing: all libraries are permissive. Avoid AGPL libraries (PyMuPDF, iText) unless a
  commercial licence is bought.

## How app/index.html works
- `state.docs[]`: each doc = { id, name, path, bytes (Uint8Array), pdf (pdf.js doc), n, sizes,
  sel (Set of 0-based page indexes), current, zoom, fit ('width'|'page'|null), history[], future[],
  dirty, sample }.
- Every page edit goes through pdf-lib → `commit(d, newBytes)` → pushes old bytes on `history`
  (undo, max 40) → `reload()` re-opens with pdf.js and re-renders tabs/thumbs/viewer.
- Actions apply to selected pages, or the current page if nothing is selected (`targets(d)`).
- Viewer: pages are placeholders sized from page dimensions; IntersectionObserver renders
  canvases lazily. Thumbnails render lazily too.
- Hand tool: pointer drag scrolls `#viewer` (tool H, hold Space, or middle mouse).
- Layout: `#app` is a grid with named areas (menu/tabs/work/status), so hiding a bar never
  shifts the workspace into an `auto` row. The view toolbar (`.toolbar`) sits inside the logo
  row (menubar) between Undo/Redo and Present; the right end is Present, Maximize, Full screen,
  Theme. As the window narrows the row sheds, in order:
  button labels (<1536px), Fit width/page (<1300), the Khmer name (<1240), Zoom −/+ (<1180),
  Prev/Next (<1120); all stay reachable via dropdown, right-click menu or shortcuts. Below
  ~1020px the tool strip scrolls sideways. Re-measure if a button is added to that row.
- Present (`startShow`/`showPage`/`endShow`): one page at a time on black, fitted to the screen,
  in HTML full screen. Button in the logo row (kept when maximized), F5 = from the start,
  Shift+F5 / Ctrl+L = from the current page, View > Present…, right-click > Present from this
  page. Next: →/↓/PgDn/Space/Enter/N/click/wheel; back: ←/↑/PgUp/Backspace/P/right-click;
  Home/End; digits+Enter jumps. Esc or leaving full screen ends it on the viewer at that page.
  A capture-phase keydown swallows every key while presenting (Delete can't touch the PDF).
  Keeps only the current page and its neighbours rendered. Maximize (F, `toggleFocus`) hides panels,
  view toolbar, status bar and most menubar buttons (Present too), and moves `#tabs` into the
  menubar right after the logo; the Maximize button becomes "Restore". Maximized is a slideshow
  in the window: only `.page.current` is shown, fitted whole (`focusFit` saves the doc's fit/zoom
  in `d.preFocus` and switches to fit page; Restore puts it back). Arrows/PgUp/PgDn only flip
  pages (no scrolling), the wheel flips one page per flick (`wheelFlipper`, shared with Present),
  `goTo` pre-draws the neighbours. The scroll handler doesn't set the current page then. In the
  normal view arrows scroll as before. Refit after a resize keeps the view's top edge.
- Right-click menu on the page area (`openMenu`, `CMENU`): the view toolbar as a list (tools,
  zoom dropdown, zoom/fit, page box, prev/next, rotate, delete, panel toggles, Maximize/Restore).
  Entries click the real toolbar buttons, so state/disabled/behaviour stay in one place.
  Right-clicking a page outside the current targets selects it first. Esc closes only the menu.
- The main script is wrapped in an IIFE: Playwright can't read `state` etc.; test via the DOM.
- `const desk = window.sastra || null` — when present (Electron), Open/Save/Save As/export use
  native dialogs, Ctrl+S writes to `d.path`; window title shows "• name — Sastra PDF" when dirty.
  Without it (web), it falls back to file inputs and browser downloads.
- Menu items in main.js use `registerAccelerator: false`; the page's keydown handler owns the
  shortcuts (Ctrl+O/S/Shift+S/W/Z/Y/=/-/0/1/2/A, Ctrl+Shift+L/R, Delete, H, V, F, Esc,
  PageUp/Down, Home/End, Ctrl+Tab/Ctrl+Shift+Tab and Ctrl+PgDn/PgUp to switch tabs — these
  work even while typing in a field; File > Next/Previous Tab). F11 is handled natively in main.js.
- Tab row (`#tabs`): ‹ `#tabstrip` › + . The strip scrolls sideways with no scrollbar; the ‹ ›
  buttons appear only when tabs overflow (`updateTabArrows`, ResizeObserver) and grey out at the
  ends; the wheel over the strip scrolls it; + (`#bNewTab`) sits outside the strip and shows only
  while maximized (the normal view has Open). Hidden when there are no tabs
  (`#app>.tabbar:not(:has(.tab))`). Maximized, the bar is 40px with no vertical padding: logo block
  and Restore/Full screen are centred on its full height, tabs sit on its bottom edge, and the
  tab row's ::before/::after draw dividers next to the logo block and the right-hand buttons.
  `toggleFocus` re-scrolls the active tab into view after moving the row (a move resets scroll).
- Brand mark: the logo image (26 px) left of "Sastra PDF | សាស្ត្រា" in the menubar. It is a
  button (`#bAbout`) that opens the About screen.
- About screen (`openAbout`, data in `AUTHOR` and `CREDITS`): opened by the brand button or
  Help > About (main sends `about`; version comes from `desk.appVersion()` → `app-version`, the
  web page says "Web version"). Shows the app, "Made by" (photo, name + dev name smith89k, title, bio, skills,
  links to smith89k.com / LinkedIn / GitHub smith89k) and open-source credits. The author
  asked to keep it short: no employer, career history, education, town or project list.
  Credits list every open-source part that ships: pdf.js, pdf-lib, JSZip, pako, Electron (not in
  web), IBM Plex, Noto Sans Khmer, plus a note for the small libraries bundled inside them —
  update it when adding a library. Links use target=_blank, which main.js opens in the browser.
- Design: IBM Plex Sans/Mono (Google Fonts, falls back to Segoe UI offline), Noto Sans Khmer for
  the Khmer name; terracotta accent; light and dark themes via CSS tokens. Both side panels use
  `--chrome` (the grey of the top and status bars); inside the Tools panel `--chrome` is
  redefined to `--panel`, so its buttons/fields/lists become lighter cards on the grey.
- Native feel: UI text can't be selected (`user-select:none` on body, arrow cursor, logo not
  draggable); text inputs are the exception and still select/edit normally.
- Theme switch: menubar button cycles System → Light → Dark (`setTheme`), saved in localStorage
  `sastra-theme` and applied by a tiny head script before first paint (`data-theme` on <html>;
  System = no attribute, follows the OS). In Electron the page tells main (`set-theme`), which
  sets `nativeTheme.themeSource` (title bar) and ticks View > Theme; that menu sends
  themeSystem/themeLight/themeDark back to the page. The page owns the choice.
- No PDF open: the tab row is hidden (no "+"); everything else stays visible but every control
  in the toolbar and Tools panel, plus Maximize, is disabled (start of `updateUI`; it marks the
  ones it switched off with `data-nodoc` and re-enables exactly those). Open, theme switch and
  Full screen stay usable. F and the right-click menu do nothing; closing the last PDF while
  maximized leaves Maximize.
  The Pages panel then shows "Pages 0", a one-line hint and three blank page cards
  (`renderThumbs`, `.thumb.ghost`) instead of an empty strip.

## Status (2026-10-14)
- Web version: done and working (also published as a claude.ai artifact — that published copy
  predates the 2026-10-14 CSS fixes below and has not been republished).
- Electron app: installed, run and built on Windows (Node 24.16). `dist\Sastra PDF Setup 1.0.0.exe`
  (82 MB, unsigned) exists. Both `npm start` and the packaged `dist\win-unpacked\Sastra PDF.exe`
  passed a 40-check Playwright run: launch maximized, argv/"Open with", second-instance handoff,
  tabs, zoom, hand-tool pan, maximize page area, select/delete/undo/redo/rotate, Ctrl+S
  overwrite (incl. Khmer filename and files from Add files), combine, split to tabs and ZIP,
  export PNG/ZIP, insert file, broken-PDF error, close prompt (Cancel + Close without saving).
- Not yet tested: running the NSIS installer itself (install dir choice, shortcuts, .pdf
  association, uninstall) and real drag-and-drop from Explorer. The About screen (added on a Mac)
  was checked in Chrome only: Help > About and its version line still need a run in Electron.
- Fixed during first run: Electron binary not unpacked on Node 24; zoomed page pushing the
  Tools panel off-screen (`#app` grid needed `grid-template-columns:minmax(0,1fr)`); stray
  Windows scrollbars on tab row, Pages panel and split inputs (box-sizing).
- Next steps: run the installer and test it; consider upgrading Electron (33 is end-of-life,
  `npm audit` lists many Electron CVEs — needs a re-test after upgrading).

## Ideas not built yet
- Extract the original embedded images from a PDF (current export renders whole pages).
- Khmer UI language toggle (menus and labels in Khmer).
- Remember recent files and window/panel state.
- Text editing, OCR (Khmer OCR), digital signatures — the hard parts of Acrobat.
- Code signing so SmartScreen doesn't warn.

## Known build gotchas
- Node 24: Electron's installer (extract-zip 2.0.1) stalls mid-unzip and exits 0, leaving
  `node_modules/electron/dist` with only `locales/`. `scripts/ensure-electron.js` (postinstall)
  detects this and unpacks the cached zip with `C:\Windows\System32\tar.exe` (Git Bash's GNU
  tar can't read .zip).
- Claude Code / VS Code extension shells set `ELECTRON_RUN_AS_NODE=1`, which makes electron.exe
  act as plain Node ("Process failed to launch"). `unset ELECTRON_RUN_AS_NODE` before launching;
  run.bat and build.bat clear it.
- electron-builder's rcedit step may log "Unable to commit changes" once and retry (antivirus
  lock on the new exe); the retry succeeded — icon and version info were verified.
- The page CSP has no 'unsafe-eval', so Playwright's `page.waitForFunction` fails inside the app;
  poll with `page.evaluate` instead.
- electron-builder "Cannot create symbolic link": run as Administrator or enable Developer Mode
  (did not occur on the first build).
- Unsigned installer → SmartScreen "More info → Run anyway".

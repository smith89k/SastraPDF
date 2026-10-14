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
                       menu events, close request, webUtils.getPathForFile)
    app/index.html     The whole app UI + PDF logic in one file (HTML/CSS/JS, no build step)
    app/vendor/        pdf.min.js, pdf.worker.min.js, pdf-lib.min.js, jszip.min.js
                       — filled by `scripts/copy-vendor.js` on `npm install` (gitignored)
    scripts/ensure-electron.js  postinstall: unpacks electron.exe with Windows tar.exe when
                       Electron's own installer silently fails (see gotchas)
    build/icon.ico|png App/installer icon (red page with a folded corner and text lines)
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
- `const desk = window.sastra || null` — when present (Electron), Open/Save/Save As/export use
  native dialogs, Ctrl+S writes to `d.path`; window title shows "• name — Sastra PDF" when dirty.
  Without it (web), it falls back to file inputs and browser downloads.
- Menu items in main.js use `registerAccelerator: false`; the page's keydown handler owns the
  shortcuts (Ctrl+O/S/Shift+S/W/Z/Y/=/-/0/1/2/A, Ctrl+Shift+L/R, Delete, H, V, F, Esc,
  PageUp/Down, Home/End). F11 is handled natively in main.js.
- Design: IBM Plex Sans/Mono (Google Fonts, falls back to Segoe UI offline), Noto Sans Khmer for
  the Khmer name; terracotta accent; light and dark themes via CSS tokens.

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
  association, uninstall) and real drag-and-drop from Explorer.
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

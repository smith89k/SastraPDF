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
                       single-instance lock, "Open with" (.pdf argv), close confirmation,
                       printing (printer list, silent print, printer preferences)
    preload.js         contextBridge API `window.sastra` (open/read/write/save dialog,
                       menu events, close request, setTheme, webUtils.getPathForFile)
    app/index.html     The whole app UI + PDF logic in one file (HTML/CSS/JS, no build step)
    app/print.js       Printing only (classic script, `window.SastraPrint`): page choice, sheet
                       layouts, sheet drawing, the Print dialog and the print run. See "Printing".
    app/pdfops.js      `window.SastraOps`, shared by index.html and task.html so both make the same files:
                       pdf.js loading (`pdfjs()`, `PDFJS_OPTS`), `baseName`, `rangeLabel`, `imageName`,
                       `renderPage` (white page → JPG/PNG blob; dpi lowered past 16 384 px a side / 64 MP)
    app/task.html|.js  The small "task window" for Explorer-menu Split / Images jobs. See "Explorer menu".
    app/pdf-file.png   The task window's header icon: build/pdf-file.png cropped to the page, 98 × 128
                       (shown 26 × 34) — a file icon, since the window works on files
    explorer-menu/     File Explorer right-click menu: menu.cpp/.def (C++ IExplorerCommand DLL),
                       AppxManifest.xml + Assets/ (unsigned sparse package for the Windows 11 first menu).
                       Built by scripts/build-explorer-menu.js into explorer-menu/out/ (gitignored)
    explorer-menu.js   Main-process module with no Electron in it: registers/unregisters the menu
                       (installer hooks) and parses/reads menu jobs (`parseTaskArgs`, `readTaskList`)
    build/installer.nsh  electron-builder `nsis.include`: customInstall / customUnInstall call
                       `Sastra PDF.exe --explorer-menu=install|uninstall|release`
    app/vendor/        pdf.min.mjs, pdf.worker.min.mjs, pdf-lib.min.js, and
                       pdfjs/{wasm,standard_fonts,cmaps}/ (pdf.js support files, ~3.3 MB)
                       — filled by `scripts/copy-vendor.js` on `npm install` (gitignored; the script
                       empties the folder first so stale files never ship)
    scripts/check-credits.js    postinstall: warns if About's library versions are out of date
    scripts/build-explorer-menu.js  run by `npm run dist` (and CI): finds MSVC with vswhere → vcvars64,
                       compiles SastraMenu.dll (/MT), packs SastraPDF.ExplorerMenu.msix with makeappx;
                       fails if the CLSID / package version differ between menu.cpp, the manifest and
                       explorer-menu.js. Alone: `npm run build:menu`
    scripts/ensure-electron.js  postinstall: downloads electron.exe and unpacks it with Windows
                       tar.exe (Electron 42+ no longer downloads itself on install; see gotchas)
    build/logo.png     Logo master, 1024 px: red rounded tile, bound palm leaves (sastra)
                       turning into a white page marked "PDF" (Inter Black), សាស្ត្រា below.
                       Made from the user's root logo.png: stray red pixels cleared, cropped,
                       and its Adobe-Acrobat-like red swirl "A" replaced by "PDF" (trademark).
                       Use build/logo.png, not the root original, for any new icon sizes.
    build/icon.ico|png App/installer icon made from logo.png (.ico: 16–256 px, PNG entries;
                       .png: 512 px window icon)
    build/pdf-file.ico|png  Icon of .pdf files in Explorer (package.json fileAssociations), from
                       the user's root file-icon.png (2026-10-15): a portrait document — white page
                       with a folded corner, red "PDF", red band with សាស្ត្រា. The original is
                       nearly square, so it was made portrait (page 990 × 1289, ≈ 0.77) by
                       stretching ONLY the plain white rows above "PDF" (+80 px) and below it
                       (+110 px); text, corner and band keep their shape. Faint specks (alpha ≤ 6)
                       outside the shape were cleared. .png = 1024 px master (page 96 % of the
                       height, centred); .ico = 16–256 px PNG entries made from it. It replaced an
                       earlier lightened copy of icon.ico. The app/taskbar/shortcut icon stays icon.ico.
    app/logo.png       64 px logo for the menubar brand mark and favicon
    app/author.jpg     200 px photo of the author (Sunnguon Taing), from their LinkedIn profile,
                       for the About screen
    .github/workflows/release.yml  GitHub Actions: on a vX.Y.Z tag, builds the installer on
                       Windows and publishes the GitHub release (see Status)
    build.bat          npm install + npm run dist, then opens dist\  (CRLF line endings)
    run.bat            npm install if needed, then npm start  (CRLF line endings)
    (no web version: web/index.html, a browser-only copy, was removed on 2026-10-15 at the
     user's request — "no need web version". It is in git history if ever wanted again.)

## Tech choices
- Rendering: **pdf.js 6.4.299**. It ships only as ES modules, so the classic main script loads it
  with `import('./vendor/pdf.min.mjs')` into `pdfjsLib` (`pdfReady`; `loadPdf` awaits it — nothing
  else touches pdf.js before a doc is loaded). `PDFJS_OPTS` passes `wasmUrl` (JBIG2 / JPEG 2000
  decoders, colour profiles), `standardFontDataUrl` and `cMapUrl` as ABSOLUTE URLs: the worker
  resolves relative ones against its own folder. Without `wasmUrl`, JBIG2/JPX images in scans come
  out blank. In Electron the worker runs as a real module Worker from file://.
- Checked when upgrading from 3.11: Khmer PDFs from Word (the user's own work documents) render
  pixel-identical; JBIG2 scans render better; two synthetic JPEG 2000 test files from pdf.js's own
  test set (odd channel counts/subsampling) render differently in every pdf.js since 5.0 — an
  upstream change (OpenJPEG replaced the old JS decoder), not something in this app.
- Editing: **pdf-lib 1.17.1** (merge, split, reorder, rotate, delete, insert).
- No ZIP files (user's wish, 2026-10-15; JSZip was removed): Split "Save to folder" and Export of
  2+ pages pick a folder first and write one file each (see "Saving several files").
- Electron **44.7.2**, electron-builder **26.15.3**, NSIS installer (not one-click, choose dir,
  desktop + Start menu shortcuts), `.pdf` file association. appId `kh.sastra.pdf`.
- `npm audit`: 0 warnings (2026-10-15). package.json `overrides` pins `global-agent` 4.1.3 (pulled in
  by electron-builder's @electron/get, build-time only; it cleared the sprintf-js warnings).
- Security: contextIsolation on, nodeIntegration off, sandbox on, CSP meta in app/index.html. The CSP
  allows 'wasm-unsafe-eval' (WebAssembly only, for pdf.js's image decoders) but not 'unsafe-eval'.
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
  button labels (<1580px), Fit width/page (<1316), the Khmer name (<1248), Zoom −/+ (<1196),
  Prev/Next (<1128); all stay reachable via dropdown, right-click menu or shortcuts. Below
  ~1055px the tool strip scrolls sideways. Re-measure if a button is added to that row
  (measured 2026-10-15 after adding Print: each step had to move up 4–38 px).
- Full screen button (`#bFull`): HTML full screen on `document.documentElement`, NOT `#app`. The
  right-click menu, dialogs (About, confirm) and toasts are appended to <body>, and only the
  full-screen element's subtree is drawn — with `#app` they opened invisibly behind the page.
  Anything new that floats over the page must go on <body> (or inside the full-screen element).
  F11 is different: native window full screen from main.js, no HTML full screen involved.
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
  native dialogs, Ctrl+S writes to `d.path`; window title is "name — Sastra PDF v1.0.0" ("• name …"
  when dirty, just the tag with no PDF). The tag comes from main.js `APP_TITLE` (package.json
  version, + " (dev)" when `!app.isPackaged`, i.e. npm start / run.bat), passed to the renderer as
  `--sastra-title=` in `additionalArguments` and exposed by preload as `desk.appTitle`.
  Without it (app/index.html opened in a plain browser) it falls back to file inputs, browser
  downloads and two generated sample PDFs — leftovers from the removed web version, still working.
- Menu items in main.js use `registerAccelerator: false`; the page's keydown handler owns the
  shortcuts (Ctrl+O/S/Shift+S/P/W/Z/Y/=/-/0/1/2/A, Ctrl+Shift+L/R, Delete, H, V, F, Esc,
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
- Printing (app/print.js; design in docs/superpowers/specs/2026-10-15-print-dialog-design.md):
  Print button `#bPrint` (after Save), Ctrl+P, File > Print…, right-click "Print…" → `printCmd` →
  `SastraPrint.open({ doc, desk, toast, svg, parseRanges })`. Acrobat-like dialog on <body>: printer +
  Properties, copies, grayscale, pages (all/current/selected/ranges, odd/even, reverse), modes Size /
  Poster / Multiple / Booklet, orientation, paper (A4 default, A3, A5, Letter, Legal), both sides,
  preview of each sheet. Settings live in localStorage `sastra-print` (not copies or page choice).
  `pickPages` and `planSheets` are pure (points, 5 mm margin) and exposed on `window.SastraPrint`, so
  tests call them directly. Printing draws every sheet with pdf.js (intent 'print') at 300 dpi
  (150 over 150 sheets) as JPEG into `#printArea`; landscape sheets are turned onto portrait paper
  (top to the left edge), so the printer always gets portrait pages of the chosen paper; `@media print`
  shows only `#printArea`. main.js `print` = `webContents.print({ silent:true, margins none,
  landscape:false, … })` with every option validated; Booklet "both sides" forces short-edge duplex.
  Electron's printer list has no default flag any more: main.js reads the Windows default printer
  from HKCU\…\Windows NT\CurrentVersion\Windows "Device". Properties = `rundll32
  printui.dll,PrintUIEntry /e /n <name>` (Windows printing preferences; what is changed there stays
  as that printer's default for the user — unlike Acrobat's per-job Properties). Without `desk`
  (plain browser) the printer rows are hidden and Print calls `window.print()`.
  Tests never print on paper: they swap main's `print` handler for `printToPDF` (see Status).
- Saving several files (`saveMany`, Split "Save to folder", Export of 2+ pages): main.js `pick-folder`
  shows a folder picker (starts in `lastDir`, shared with Save/Export) BEFORE anything is made, keeps
  base names only, numbers same-name parts within one batch " (2)", and when names already exist asks
  once: Replace / Keep both (default: clashing names get the first free " (n)") / Cancel. The page then
  makes each file and writes it at once with `write-file` (nothing big held in memory). One page of
  Export still uses the Save dialog. Plain browser: one download per file.
- Explorer menu (design: docs/superpowers/specs/2026-10-15-explorer-menu-design.md). Right-click PDFs →
  Sastra PDF ▸ Combine N files (2+ PDFs only) / Split here / Split to "name\" / Images here (JPG) /
  Images to "name\" (JPG). The DLL (CLSID {47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}) gets ALL selected items
  in one Invoke, writes them to `%TEMP%\Sastra PDF\menu-*.txt` (UTF-8, a line each) and starts
  `Sastra PDF.exe --sastra-task=<combine|split-here|split-folder|images-here|images-folder> --sastra-list=<file>`
  through Explorer (IShellDispatch2, so the app doesn't run inside the package identity). main.js
  `handleTask` (first launch and `second-instance`): `readTaskList` reads only that folder/name pattern,
  deletes the file and sorts by name like Explorer (01, 02, 10). Combine → main window `combine-paths`
  → `combinePaths` (one unsaved tab "Combined.pdf", `d.saveDir` = the files' folder, Save As starts
  there). Split/Images → `task-batch` to the task window (one per click, queued; "N more waiting"):
  per click it opens the PDFs, asks ONE `resolve-names` question (Replace / Keep both / Cancel — the
  same `resolveNames` as Split/Export "Save to folder"), `make-dir` (only `<folder>\<one name>`), writes
  each file at once; problems are listed and keep the window open, otherwise it closes after 2 s; the app
  quits when no window is left. body[data-done] counts finished runs (tests wait on it). The window is as
  tall as its content (task.js ResizeObserver → `task-size` → `setContentSize`, 440 wide, 100–420 tall;
  the problem list scrolls past 216 px): 440 × 130 while working, no empty space.
  Registration (`--explorer-menu=install`, before the single-instance lock, no window): Windows 11 and
  not `--silent` → re-runs itself elevated (`add-package`: `Add-AppxPackage -AllowUnsigned
  -ExternalLocation <install>`; UAC names Sastra PDF), then checks `Get-AppxPackage` AS THE USER; else
  (Windows 10, No, no admin, silent, failure) classic HKCU keys (`SystemFileAssociations\.pdf\shell\SastraPDF`
  ExplorerCommandHandler + `CLSID\…\InprocServer32`, MultiSelectModel Player). Never both. State in
  `HKCU\Software\Sastra PDF\ExplorerMenu` (Mode, Location, Version, Declined): a set-up package is kept
  without asking; Declined=1 stops repeat prompts until a full uninstall. `release` (old uninstaller on
  update) stops our dllhost and moves a DLL Explorer still holds to `%TEMP%\Sastra PDF\old` (same drive)
  or `<parent of install>\sastra-pdf-old`; `cleanOld` empties those on install and app start.
  Log: `%TEMP%\Sastra PDF\explorer-menu.log`.
- Brand mark: the logo image (26 px) left of "Sastra PDF | សាស្ត្រា" in the menubar. It is a
  button (`#bAbout`) that opens the About screen.
- About screen (`openAbout`, data in `AUTHOR` and `CREDITS`): opened by the brand button or
  Help > About (main sends `about`; version comes from `desk.appVersion()` → `app-version`; in a
  plain browser it says "Web version"). Shows the app, "Made by" (photo, name + dev name smith89k, title, bio, skills,
  links to smith89k.com / LinkedIn / GitHub smith89k) and open-source credits. The author
  asked to keep it short: no employer, career history, education, town or project list.
  Credits list every open-source part that ships, with its version: pdf.js, pdf-lib, pako,
  Electron, IBM Plex, Noto Sans Khmer (fonts: no version; files packaged by Fontsource), plus
  a note for the parts bundled inside them (pdf.js's OpenJPEG, PDFium JBIG2 + Foxit fonts, qcms,
  Adobe CMaps, Liberation Sans; pdf-lib's UPNG and tslib; Electron's Chromium/Node.js/FFmpeg
  with LICENSES.chromium.html in the app folder; the installer's electron-builder and NSIS). Rows
  are [name, version, by, licence, link]; `scripts/check-credits.js` (postinstall) warns when a
  version there differs from node_modules. Update it when
  adding a library. Links use target=_blank, which main.js opens in the browser.
- Design: IBM Plex Sans/Mono. All UI fonts SHIP INSIDE THE APP (no Google Fonts, no network: the
  README's code signing policy promises the app sends nothing anywhere on its own — keep it that
  way). copy-vendor.js builds app/vendor/fonts/fonts.css from @fontsource packages: Plex Sans
  400/500/600, Plex Mono 400/500, Noto Sans Khmer 400/500/600; Latin, Latin-ext and Khmer subsets,
  woff2 only (~370 KB). Khmer anywhere in the
  UI (tab and file names, toasts, the brand) uses Noto Sans Khmer: it sits second in the
  `--ui` and `--mono` stacks, then "Khmer UI" (Windows). Without it Chromium drew Khmer
  with Leelawadee UI (a Thai font) — keep a Khmer font in any new font stack; terracotta accent; light and dark themes via CSS tokens. Both side panels use
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

## Status (2026-10-15)
- Web version: removed 2026-10-15 (user doesn't need it). An old copy published as a claude.ai
  artifact in the first conversation may still exist; it was never updated and is not this app.
- Electron app: upgraded 2026-10-15 from Electron 33 (end-of-life) to 44.7.2, electron-builder
  25 → 26.15.3 and pdf.js 3.11.174 → 6.4.299; `npm audit` went from 20 warnings to 0.
  `dist\Sastra PDF Setup 1.0.0.exe` (114 MB, unsigned; +30 MB is Electron itself) rebuilt.
  Both `npm start` and the packaged `dist\win-unpacked\Sastra PDF.exe` passed a 42-check Playwright
  run: Electron version, launch maximized, argv/"Open with" (Khmer filename), second-instance
  handoff, page + thumbnail rendering, zoom, hand-tool pan, delete/undo/redo/rotate, Ctrl+S
  overwrite, Save As, Open (remembers folder), broken-PDF error, combine, split to tabs and ZIP,
  export PNG, Maximize, Present (F5/Esc), theme ↔ nativeTheme, About version line, close prompt
  (Cancel + Close without saving), no console errors. Test script lives outside the project.
  A render check (page canvases fingerprinted, old vs new pdf.js) covered Khmer Word PDFs and
  pdf.js test files for JBIG2, JPEG 2000, non-embedded fonts and Japanese CMaps, in both builds.
- **Released v1.0.0 on 2026-10-15**: GitHub release `v1.0.0` on smith89k/SastraPDF (private repo)
  with `Sastra PDF Setup 1.0.0.exe` attached. Before release the installer was run silently
  (`/S /D=<dir>`): installs in ~16 s, makes desktop + Start-menu shortcuts, an "Installed apps"
  entry (Sastra PDF 1.0.0, publisher Sunnguon Taing) and a .pdf "Open with" entry; the installed
  app opened a Khmer-named PDF with title "… — Sastra PDF 1.0.0"; the silent uninstall removed all
  of it. Not tested: the installer's interactive pages and real drag-and-drop from Explorer.
- **GitHub Actions is blocked by account billing (2026-10-15)**: every run of the release workflow
  stops before starting with "recent account payments have failed or your spending limit needs to
  be increased" (the user must fix it under GitHub Settings > Billing & plans). So v1.0.0 and v1.0.1
  were built locally (`npm run dist`) and uploaded with `gh release create`; the v1.0.1 tag's
  workflow run failed for that reason (re-running it would now fail anyway: the release exists).
  Until billing is fixed, release by hand the same way, after running the Playwright checks.
- Once billing works, releases are built by GitHub Actions (`.github/workflows/release.yml`,
  windows-latest, Node 24). To release: `npm version X.Y.Z --no-git-tag-version` (title, About and installer
  name follow package.json), run the Playwright checks locally, merge to main, then
  `git tag -a vX.Y.Z -F notes.md` (the tag message becomes the release notes) and
  `git push origin vX.Y.Z`. The workflow fails if the tag and package.json disagree, builds with
  `--publish never`, and creates the release with the installer + its SHA-256. "Run workflow" by
  hand only builds (installer kept as an artifact).
- Fixed during first run: Electron binary not unpacked on Node 24; zoomed page pushing the
  Tools panel off-screen (`#app` grid needed `grid-template-columns:minmax(0,1fr)`); stray
  Windows scrollbars on tab row, Pages panel and split inputs (box-sizing).
- **Print dialog added 2026-10-15** (merged to main and pushed, with the lighter .pdf file icon, PR #6): a 71-check Playwright run (planner, dialog,
  print output via `printToPDF` instead of paper, layout widths, light/dark, 800×600 window) plus the
  plain-browser fallback all passed. Not yet tested on real paper (the user's office printers: Canon
  iR-ADV C3830 copier = Windows default, HP Color LaserJet M855): check paper size, both-sides flip and
  that nothing is cut off at the edges.
- **v1.0.2 built 2026-10-15** (Print dialog, Split/Export to a folder with no ZIP, new portrait .pdf file
  icon): `dist\Sastra PDF Setup 1.0.2.exe` (114 MB, unsigned). The packaged `dist\win-unpacked` app
  passed the 71 print checks and the 22 folder-saving checks; title "… — Sastra PDF v1.0.2", About
  "Version 1.0.2". Not run: the silent install test (it would replace the user's own installed copy).
  **Released v1.0.2 on 2026-10-15**: GitHub release `v1.0.2` with `Sastra.PDF.Setup.1.0.2.exe`
  (SHA-256 99d63275…dc326, matches GitHub's digest), uploaded with `gh release create` because the
  tag's workflow run was again blocked by billing. Tag message = release notes (`--cleanup=whitespace`
  keeps the ## headings, which the default cleanup strips as comments).
- **Explorer right-click menu added 2026-10-15** (branch feat/explorer-menu; spec + plan in docs/superpowers).
  Spike first: an unsigned sparse package shows in the first Windows 11 menu (build 26300, no Developer
  Mode) but only when added from an elevated session (per-user add: 0x80073D2B "an unsigned package cannot
  include Executable activations"); per-user Remove-AppxPackage needs no admin. Tests (outside the
  project): C++ harness 20 checks (titles, hidden Combine, Khmer names, list file); unit 25 (explorer-menu.js,
  registry on a test key); Playwright menu-test 33 (task window, clash question, problems, queue, Cancel,
  Combine, guards) — all also on dist\win-unpacked, with the 71 print, 22 folder and 8 pdfops checks. With
  the user on this PC: package install (UAC Yes) → all 4 menu actions worked from the first menu;
  uninstall removed it; UAC No → classic menu under "Show more options" worked (Split, Combine); a DLL
  held by Explorer was moved aside; reinstall didn't ask again; `--silent` → classic, no prompt.
  Not tested: a real Windows 10 PC, a PC without admin rights, the full NSIS installer run (it would
  replace the user's installed copy). The local `dist\Sastra PDF Setup 1.0.2.exe` was rebuilt with
  the menu: it is NOT the released 1.0.2 — bump the version before releasing.
  Found on the way: pdf.js 6's PDFDocumentProxy has no destroy() (it's on the loading task); index.html
  `loadPdf` still calls `d.pdf.destroy()` inside try/catch, so old documents aren't freed after edits.
- Next steps: keep Electron on a supported version (each major gets about 6 months of fixes);
  re-run the Playwright checks after every upgrade. Code signing would stop SmartScreen warnings.

## Ideas not built yet
- Extract the original embedded images from a PDF (current export renders whole pages).
- Khmer UI language toggle (menus and labels in Khmer).
- Remember recent files and window/panel state.
- Text editing, OCR (Khmer OCR), digital signatures — the hard parts of Acrobat.
- Code signing so SmartScreen doesn't warn. A signed menu package would also install without admin
  (no UAC prompt) — sign the .msix too and drop the OID from its Publisher.

## Known build gotchas
- `npm run dist` can fail with "EPERM: operation not permitted, rename dist\win-unpacked.tmp" right
  after the old build was run or tested (antivirus/indexer still holding files). Delete
  `dist\win-unpacked.tmp` and run it again; the retry worked.
- Electron binary: Electron 42+ doesn't download electron.exe on `npm install` (only on first run),
  and Electron 33's installer stalled on Node 24. `scripts/ensure-electron.js` (postinstall) fetches
  the checksummed zip via `@electron/get` and unpacks it with `C:\Windows\System32\tar.exe`
  (Git Bash's GNU tar can't read .zip).
- Electron 43+: open/save dialogs without `defaultPath` always start in Downloads and the OS no
  longer remembers the last folder, so main.js keeps `lastOpenDir` (Open) and `lastDir` (Save/Export).
- Before upgrading Electron, read docs/breaking-changes.md in the electron repo for every major
  version crossed.
- Claude Code / VS Code extension shells set `ELECTRON_RUN_AS_NODE=1`, which makes electron.exe
  act as plain Node ("Process failed to launch"). `unset ELECTRON_RUN_AS_NODE` before launching;
  run.bat and build.bat clear it.
- electron-builder's rcedit step may log "Unable to commit changes" once and retry (antivirus
  lock on the new exe); the retry succeeded — icon and version info were verified.
- The page CSP has no 'unsafe-eval', so Playwright's `page.waitForFunction` fails inside the app;
  poll with `page.evaluate` instead.
- Testing while the user has Sastra PDF open (run.bat): the single-instance lock makes a test launch
  hand its files to the USER's window and quit. Launch test copies with
  `--user-data-dir=<scratch folder>` (a separate profile = a separate lock).
- `npm run dist` needs Visual Studio Build Tools (C++ x64) + the Windows SDK for the Explorer menu
  (this PC: Build Tools 2026 / MSVC 14.51, SDK 10.0.26100). vcvars prints "'vswhere.exe' is not
  recognized" — harmless.
- Explorer menu package: change `PKG_VERSION` (explorer-menu.js) and the manifest's Version together,
  and only when the manifest changes — a new version makes the installer ask for admin again.
- Testing the real menu: close the user's own Sastra PDF first (the single-instance lock would hand the
  menu's jobs to it), and every PowerShell/bash call must clear ELECTRON_RUN_AS_NODE — with it set,
  `Sastra PDF.exe --explorer-menu=…` silently does nothing.
- print-test.js remembers print settings in its `ud` profile: delete `ud` before a run, or Poster
  counts 80 tiles instead of 60.
- electron-builder "Cannot create symbolic link": run as Administrator or enable Developer Mode
  (did not occur on the first build).
- Unsigned installer → SmartScreen "More info → Run anyway".

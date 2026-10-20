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
    main.js            Electron main: window (opens maximized, own title bar), menus (☰ pop-up), file dialogs,
                       single-instance lock, "Open with" (.pdf argv), close request (the page asks),
                       printing (printer list, silent print, printer preferences)
    preload.js         contextBridge API `window.sastra` (open/read/write/save dialog,
                       menu events, close request, setTheme, webUtils.getPathForFile)
    app/index.html     The whole app UI + PDF logic in one file (HTML/CSS/JS, no build step)
    app/print.js       Printing only (classic script, `window.SastraPrint`): page choice, sheet
                       layouts, sheet drawing, the print screen (laid out like Bohpum's), the print run and
                       Save as PDF. See "Printing".
    app/pdfops.js      `window.SastraOps`, shared by index.html and task.html so both make the same files:
                       pdf.js loading (`pdfjs()`, `PDFJS_OPTS`), `closePdf`, `baseName`, `rangeLabel`, `imageName`, `fmtBytes`,
                       `renderPage` (white page → JPG/PNG blob; dpi lowered past 16 384 px a side / 64 MP)
    app/images.js      `window.SastraImages` (main window only): pictures → PDF pages for the Explorer menu's
                       Make PDF / Combine. Type from the content (magic bytes); JPEG as it is (EXIF orientation
                       applied by the drawing matrix), PNG lossless, BMP/GIF/WebP via createImageBitmap → PNG;
                       page = the picture's own size (dpi from JFIF/EXIF/pHYs/BMP header, else 96; max 14 400 pt)
    app/reduce.js      `window.SastraReduce` (main window + task window): Reduce file size as Acrobat's — pictures over
                       225 ppi → 150 ppi, JPEG 0.75 when ≥ 10 % smaller; RGB pictures keep their colour space
                       (DeviceRGB or ICCBased), DeviceGray ones become RGB JPEG, ICCBased grey and /ColorTransform 0
                       ones are left alone; a JPEG's own EXIF + ICC segments are zeroed before decoding (as pdf.js
                       does: Electron 44's createImageBitmap turns EXIF-tagged JPEGs even with imageOrientation:
                       'none'); soft masks resized with their picture, kept Flate; CMYK/Indexed/JPX/JBIG2/CCITT/
                       1-bit and pictures under 20 KB untouched. Prune first (no /Thumb, /PieceInfo, unused objects),
                       then pictures, then Flate for plain streams, object streams; no copy unless ≥ 1 % smaller.
                       `reduce(bytes, { onStep, isCancelled })` → { bytes|null, before, after } (throws .reason
                       protected/damaged/cancelled), `reducedName` → "<name>_reduced.pdf"
    app/notes.js       `window.SastraNotes`: What's new — every version's notes (newest first, kinds new / improved / fixed /
                       removed, text only) + `noteFor` / `earlierNotes` / `shouldShow`. Written by hand at release time
    app/task.html|.js  The small "task window" for Explorer-menu Split / Images / Reduce file size jobs. See "Explorer menu".
    app/pdf-file.png   The task window's header icon: the .pdf file icon's page filling 98 × 128
                       (shown 26 × 34) — a file icon, since the window works on files
    explorer-menu/     File Explorer right-click menu for PDFs and pictures: menu.cpp/.def (C++ IExplorerCommand DLL),
                       AppxManifest.xml + Assets/ (unsigned sparse package for the Windows 11 first menu).
                       Built by scripts/build-explorer-menu.js into explorer-menu/out/ (gitignored)
    explorer-menu.js   Main-process module with no Electron in it: registers/unregisters the menu
                       (installer hooks) and parses/reads menu jobs (`parseTaskArgs`, `readTaskList`)
    build/installer.nsh  electron-builder `nsis.include`: customInstall / customUnInstall call
                       `Sastra PDF.exe --explorer-menu=install|uninstall|release`
    app/vendor/        pdf.min.mjs, pdf.worker.min.mjs, pdf-lib.min.js, and
                       pdfjs/{wasm,standard_fonts,cmaps}/ (pdf.js support files, ~3.3 MB)
                       — filled by `scripts/copy-vendor.js` on `pnpm install` (gitignored; the script
                       empties the folder first so stale files never ship)
    scripts/check-credits.js    postinstall: warns if About's library versions are out of date
    scripts/check-notes.js  first step of `pnpm run dist` / `dist:portable` / `dist:store` and the release workflow: fails
                       when the newest What's new entry isn't package.json's version, or an entry is broken (date, kind,
                       text, twice)
    scripts/build-explorer-menu.js  run by `pnpm run dist` (and CI): finds MSVC with vswhere → vcvars64,
                       compiles SastraMenu.dll (/MT), packs SastraPDF.ExplorerMenu.msix with makeappx;
                       fails if the CLSID / package version differ between menu.cpp, the manifest and
                       explorer-menu.js. Alone: `pnpm run build:menu`
    scripts/ensure-electron.js  postinstall: downloads electron.exe and unpacks it with Windows
                       tar.exe (Electron 42+ no longer downloads itself on install; see gotchas)
    build/logo.png     Logo master, 1024 px (since 2026-10-17): red rounded tile (corner radius ≈ 25 %),
                       a white page with a red "S" in front of a pink page with four red lines.
                       From the user's root logo.png (728 px). Like "file icon.png", the original is
                       OPAQUE with a painted checkerboard "transparent" background, so it was cut out
                       by shape, not by colour: the tile was measured (715 × 700 px, corner radius
                       180 — a circle-cornered rounded rect fits to ~1 px rms), made square (2 %
                       taller), drawn with an anti-aliased mask, and the edge pixels take the colour
                       from 1.5 px inside (no checker fringe or white halo on dark backgrounds).
                       Margin 2.25 % of the size, snapped to whole pixels so small sizes stay sharp.
                       All logo files below come straight from the root original that way (one resample
                       each), not from this master. The old palm-leaf logo is in git history.
    build/icon.ico|png App/installer icon from the same logo (.ico: 16, 20, 24, 32, 40, 48, 64, 128, 256 px,
                       PNG entries; .png: 512 px window icon). The Explorer menu's "Sastra PDF" entry
                       shows the exe's icon (menu.cpp GetIcon = exe,0), so it follows this one.
    build/pdf-file.ico|png  Icon of .pdf files in Explorer (package.json fileAssociations), from the
                       user's root "file icon.png" (2026-10-17, 420 × 552): a white page with a pink
                       outline, rounded corners (radius 45), the top-right corner folded (red flap,
                       fold line x = 1.0291·y + 290.5 in the original's pixels), the logo's "S" + lined
                       page, and a red band with ".pdf". Already portrait (page 416.5 × 548, ≈ 0.76),
                       so nothing was stretched; cut out the same way as the logo. .png = 1024 px
                       master (page 96 % of the height, centred); .ico = the same 9 sizes. The
                       app/taskbar/shortcut icon stays icon.ico.
    app/logo.png       64 px logo (tile fills the whole square) for the menubar brand mark, About and favicon
    explorer-menu/Assets/  Square150x150Logo (1 px margin), Square44x44Logo, StoreLogo (50) — the same logo.
                       Package version NOT bumped for them: add-package removes the old package before
                       adding, and AppListEntry="none" means they show almost nowhere.
    app/author.jpg     200 px photo of the author (Sunnguon Taing), from their LinkedIn profile,
                       for the About screen
    .github/workflows/release.yml  GitHub Actions, by hand only (Run workflow + version). Since 1.2.0 (as Bohpum since
                       0.2.5): Store package only — three jobs (check / build with no token / publish), no secret,
                       nothing to R2; the GitHub release carries Sastra-PDF-Store-<version>.msix for Partner Center.
                       1.2.0 was the last installer release (R2 keeps serving it to installed copies)
    updater.js         Automatic updates, no Electron inside (main.js hands in electron-updater's autoUpdater):
                       `updatesRunHere`, `checkAnswer`, `installBlock`, `logTo`, `createUpdater` (10 s, then every 6 h)
    store.js           The Microsoft Store copy's rules, no Electron inside: `isStoreCopy` (process.windowsStore, or
                       SASTRA_STORE_TEST=1 from source), `readStoreInfo` (store.json = Partner Center identity),
                       `SIDELOAD` (unsigned test identity SastraPDF.StoreTest), `storePageUrl`. In the Store copy main.js
                       never updates, never sets up/repairs the menu (`--explorer-menu=` exits 0), Check for Updates opens
                       the Store, and userData is "Sastra PDF Store" (own single-instance lock)
    store.json         Partner Center › Product identity (committed, not secret); the release refuses without it
    build/store.config.js + scripts/store-config.js  electron-builder config of the Store package (`pnpm run dist:store`,
                       SASTRA_STORE_SIDELOAD=1 = test package): appx into dist-store/, no update-config.json, only
                       SastraMenu.dll, custom manifest build/store-manifest.xml (.pdf "Open with", the menu on EXTS, the
                       DLL at app\resources\explorer-menu), logos in build/appx/
    scripts/menu-sources.js  menu.cpp, the sparse manifest and the Store manifest agree (build-explorer-menu.js runs it)
    scripts/store-check.js   the built Store package has the DLL and store.js, and no key / app-update.yml / sparse .msix
    scripts/release-notes.js  the release workflow: GitHub release notes from a version's What's new entry
    docs/updates-setup.md  Cloudflare + GitHub setup click by click, how to release, and the Microsoft Store (section 7)
    docs/store-listing.md  the Store listing texts for Partner Center (description, features, keywords, privacy policy,
                       the runFullTrust reason, notes for certification)
    build.bat          pnpm install + pnpm run dist, then opens dist\  (CRLF line endings)
    run.bat            pnpm install if needed, then pnpm start  (CRLF line endings)
                       (both stop with "run npm install -g pnpm" when pnpm is missing)
    pnpm-workspace.yaml  pnpm settings (pnpm reads them here, not from package.json or .npmrc):
                       `overrides` and `allowBuilds`. pnpm-lock.yaml is the lock file (no package-lock.json)
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
- Package manager: **pnpm 12.4.1** (since 2026-10-17, the user's wish — one shared copy of each package
  on disk; was npm). package.json `packageManager` pins it (CI's pnpm/action-setup reads it). pnpm-lock.yaml
  was made with `pnpm import` from the npm lock: same 283 package versions. pnpm 12 stops an install when a
  dependency wants to run an install script nobody approved: `allowBuilds` in pnpm-workspace.yaml says
  `electron-winstaller: false` (its script only picks 7-Zip for Squirrel installers; we build NSIS).
- `pnpm audit`: no known vulnerabilities (2026-10-17). pnpm-workspace.yaml `overrides` pins `global-agent`
  4.1.3 (pulled in by electron-builder's @electron/get, build-time only; it cleared the sprintf-js warnings).
  pnpm ignores npm's package.json `overrides` (it silently installed 3.0.0).
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
- Sharp text (since 2026-10-20, the user: "acrobat look sharper"; spec 2026-10-20-sharper-pages-design.md): a page
  canvas shown 1:1 (viewer, maximized slideshow, Present) is opaque — `getContext('2d', { alpha:false })` — so Chromium
  draws pdf.js's glyphs with ClearType like Acrobat (it follows Windows' ClearType setting). Measured first: the canvas
  was already 1:1 (Chromium pixel-snaps it; moving it by sub-pixels made it worse) — the difference was only grey vs
  ClearType anti-aliasing. A canvas held to the 4800 px limit is stretched and stays transparent (grey); thumbnails,
  print and exported images stay grey too. No devicePixelRatio cap (it was 2). Present sizes its canvas in CSS as
  canvas pixels / dpr. Test: sharp-screen-test.js.
- Pages panel width (since 2026-10-17, as in Bohpum): drag `#pagesResizer` (the panel's right edge, 7 px, red line on
  hover) 140–400 px, double-click = normal 186; `--pages-w` on <html>, kept in localStorage `sastra-pages-w` and set by
  the head script before first paint. Thumbnail boxes are sized by CSS (`--tw`/`--th` from the width, `--ar` = page
  w / h inline; at 186 px the old 128 × 168 max); after a drag `redrawThumbs()` drops every doc's `thumbCanvas` so they
  redraw sharp (`drawThumb` uses the box's `clientWidth`).
- Drop into the Pages panel (since 2026-10-19; spec/plan docs/superpowers/*/2026-10-19-drop-into-pages*): the panel
  (`#thumbs`) owns `dragover`/`drop` for both dragged thumbnails and files; `dropSpot(y)` puts the red line before or
  after the thumbnail under the mouse (its middle decides; a gap goes before the next one), above the first = at the
  start, below the last = at the end. Files (PDFs + the menu's picture types, by content)
  → `fileItems` → `insertItems(d, at, items)`: name order (`byName`, as Explorer), pictures at their own size
  (`addImagePage(doc, bytes, at)`), ONE commit, unusable files named in one error toast. Insert file uses it too (after
  the current page). Over the panel `#app.dropping-pages` hides the page area's "Drop PDFs…" box; elsewhere and with no
  PDF open files still open as tabs. A drag carrying files is ALWAYS a file drop (a page drag never carries files), so a
  stale `dragFrom` can't turn it into a page move. Page drags: `dragFrom = { docId, pages }`, `copyMove`; another file's
  tab lights up (`.tab.drop-on`) and opens after `TAB_HOVER_MS` 500 (`tabHover`, cancelled by the window's dragover when
  the mouse leaves it); drop at the line or on the tab (= at the end) → `copyPagesTo`: ALWAYS a copy, the source keeps its
  pages, one undo step in the target (the user, 2026-10-19: "drag cross file don't move just copy" — Acrobat's rule;
  until then it moved, Ctrl = copy). Inside one file a drag moves (`movePages`) and Ctrl at the drop copies there
  (`copyPagesTo` with the same file; drop effect `copy`). `endPageDrag` runs on every drop and on a `dragend` caught at the window. Test: drop-test.js (groups 1–4;
  runs on Windows and, under `xvfb-run -a`, on Linux). A script-made `DataTransfer` in this Chromium ignores writes to
  `effectAllowed`/`dropEffect`, so the test gives it own writable properties to read the app's choice back.
- Opening PDFs (since 2026-10-17; spec/plan docs/superpowers/*/2026-10-17-open-progress*; Bohpum's reading box, the
  user: "similar to bohpum"): every way in — Open (main's `open-dialog` now returns only `[{ path, name }]`), "Open
  with" / start-up files (`openPaths`), dropped files and the Combine panel's Add files (`openFiles`) — goes through
  `queueOpen(items)` (item = `{ name, path, read() }`): ONE job at a time, files arriving meanwhile join it ("File 6 of
  8"; no more "Please wait"), already-open paths just switch tabs. `startProgress({ title, failTitle })` owns the box
  (`.modal.progress`, classes as Bohpum's `p-what/p-step/p-bar/p-fill/p-lines/p-foot`): shown through `inTurn` only if
  the job still runs `SHOW_AFTER_MS` 500 after it started, then at least `MIN_SHOWN_MS` 400; "Opening <name>" ·
  "Reading the file…" → "Opening…" → "Reading page 120 of 950" (`loadPdf(d, { onTask, onPage, isCancelled })`, the
  bar fills by pages, drawn once a frame; a sliding stripe while unknown). Cancel / Esc: `job.cancelled`, this file's
  loading task destroyed (`onCancel` returns an unsubscribe, so a cancel never closes files already opened), later
  files skipped. Problems (`openDoc` throws `.reason` / `.userReason`: password / damaged / engine; read errors) are
  listed and the box turns `.failed` — "Couldn't open <name>" or "Couldn't open N files", "N problems below", Close.
  `openBytes` (split parts, Combine result, samples) still toasts. Right-click Combine uses the same box.
- Hand tool: pointer drag scrolls `#viewer` (tool H, hold Space, or middle mouse).
- Layout: `#app` is a grid with named areas (menu/tabs/work/status), so hiding a bar never
  shifts the workspace into an `auto` row. The view toolbar (`.toolbar`) sits inside the logo
  row (menubar) between Undo/Redo and Present; the right end is Present, Maximize, Theme, then
  Windows' caption buttons. As the window narrows the row sheds, in order:
  button labels (<1639px), Fit width/page (<1385), the Khmer name (<1317), Zoom −/+ (<1264),
  Prev/Next (<1196); all stay reachable via dropdown, right-click menu or shortcuts. Below
  ~1100px the tool strip scrolls sideways. Re-measure if a button is added to or removed from that row
  (re-measured 2026-10-16 for ☰ + the caption buttons and again without the Full screen button: force each
  step's hidden items at full width, measure the row's leftover space, threshold = needed width + 3;
  "/ 9999" pages). 2026-10-18: Rotate left/right and Delete left the toolbar (the user: they duplicated
  Organize pages; the right-click menu now clicks `#oRotL`/`#oRotR`/`#oDel`); that freed exactly 113 px at
  every step, so each threshold moved down 113. The measurement now comes out ~10 px under the old numbers,
  which were kept as a margin. At 175 % screen scaling the viewport is fractional (1618.29 for a "1618" window),
  so a test right at a threshold can land on the other side. 2026-10-20: the Save ▾ arrow (20 px) moved every threshold up 20
  (save-menu-test.js measures the row at each step).
- Title bar = the logo row (since 2026-10-16; Windows' own bar was 8 px shorter maximized — its edge goes
  off-screen — so everything jumped). main.js `titleBarStyle: 'hidden'` + `titleBarOverlay` (height
  `BAR_H` 44 = the 45 px row minus its line; colours `BAR_COLORS` = --chrome / --fg, KEEP IN SYNC with the
  CSS tokens; `paintBar` on set-theme and nativeTheme 'updated'). Windows still draws minimize / maximize /
  close (snap layouts too) over the row's right end; `.menubar` padding-right reserves
  `100vw - env(titlebar-area-x) - env(titlebar-area-width)` (137 px; 0 in a plain browser). The row is
  `-webkit-app-region: drag` (move, double-click maximizes, right-click = system menu); its buttons,
  selects, inputs and tabs are no-drag, and so are `.modal-bg`, `.cmenu`, `.show` — a drag area
  ignores what is drawn over it. Full screen (F11, Present): Windows draws no caption buttons
  but the page is still told they're there, so main sends `full-screen` → `fullwin` class on <html> →
  no reserve. No Windows menu row any more: ☰ (`#bMenu`, hidden without `desk`) → `show-menu` →
  `Menu.getApplicationMenu().popup()` under the button; Alt pressed and let go alone, or F10, opens it
  too (not over a dialog or Present). Tests: `titlebar-test.js` (MOUSE=1 adds real drag/double-click/click).
- No Full screen button any more (removed 2026-10-16, the user: "not necessary since Maximize did the same").
  It was HTML full screen on `document.documentElement` (not `#app`: only the full-screen element's subtree
  is drawn, and the right-click menu, dialogs and toasts live on <body>) — keep that in mind if it comes
  back. F11 / View > Full Screen (native window full screen from main.js) is still there.
- Save icon (`ICONS.save`): a floppy disk, as in Acrobat / Office (2026-10-16; it was a down arrow into a
  tray, which read as "Download"). Used by the Save button only.
- Save ▾ (since 2026-10-20, as Acrobat's split Save): `.splitbtn` = `#bSave` + a 20 px arrow `#bSaveMore` (`up` icon
  turned) that opens `.cmenu.savemenu` (`openSaveMenu`, same look and keys as the right-click menu — `menuKeys`):
  Save (Ctrl+S) / Save As… (Ctrl+Shift+S) / Save as Reduced Size PDF… (`saveReducedActive`, also ☰ File, command
  `saveReduced`). The reduced copy: `SastraReduce.reduce(d.bytes)` under `busy` ("Reducing file size · picture 3 of
  40…"), then main's Save dialog (kind `'reduced'`, title "Save as Reduced Size PDF") starting in the OPEN FILE'S folder
  (the user's wish; `d.saveDir` for a file with no path), name `<name>_reduced.pdf`; toast "Saved … · 12.4 MB → 3.1 MB
  (75 % smaller)"; the tab stays the original. Not smaller → "<name> is already as small as it can be — no copy made".
- Present (`startShow`/`showPage`/`endShow`): one page at a time on black, fitted to the screen,
  in HTML full screen. Button in the logo row (kept when maximized), F5 = from the start,
  Shift+F5 / Ctrl+L = from the current page, View > Present…, right-click > Present from this
  page. Next: →/↓/PgDn/Space/Enter/N/click/wheel; back: ←/↑/PgUp/Backspace/P/right-click;
  Home/End; digits+Enter jumps. Esc or leaving full screen ends it on the viewer at that page.
  A capture-phase keydown swallows every key while presenting (Delete can't touch the PDF).
  Keeps only the current page and its neighbours rendered. Maximize (F, `toggleFocus`) hides panels,
  view toolbar, status bar and most menubar buttons (Present too), and moves `#tabs` into the
  menubar right after the logo; the Maximize button becomes "Restore". Maximized is a slideshow
  in the window: only `.page.current` is shown, fitted whole, with no red selection frame (since 2026-10-17, the
  user's wish; the selection itself stays, so Restore shows it again) (`focusFit` saves the doc's fit/zoom
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
  version, + " (dev)" when `!app.isPackaged`, i.e. pnpm start / run.bat), passed to the renderer as
  `--sastra-title=` in `additionalArguments` and exposed by preload as `desk.appTitle`.
  Without it (app/index.html opened in a plain browser) it falls back to file inputs, browser
  downloads and two generated sample PDFs — leftovers from the removed web version, still working.
- Menu items in main.js use `registerAccelerator: false`; the page's keydown handler owns the
  shortcuts (Ctrl+O/S/Shift+S/P/W/Z/Y/=/-/0/1/2/A, Ctrl+Shift+L/R, Delete, H, V, F, Esc,
  PageUp/Down, Home/End, Ctrl+Tab/Ctrl+Shift+Tab and Ctrl+PgDn/PgUp to switch tabs — these
  work even while typing in a field; File > Next/Previous Tab). F11 is handled natively in main.js.
  The menu is never shown as a row: it pops up from ☰ / Alt / F10 (see "Title bar").
- Tab row (`#tabs`): ‹ `#tabstrip` › + . The strip scrolls sideways with no scrollbar; the ‹ ›
  buttons appear only when tabs overflow (`updateTabArrows`, ResizeObserver) and grey out at the
  ends; the wheel over the strip scrolls it; + (`#bNewTab`) sits outside the strip and shows only
  while maximized (the normal view has Open). Hidden when there are no tabs
  (`#app>.tabbar:not(:has(.tab))`). Maximized, the bar is 45px — the normal bar's height, so the bar, logo and
  Restore don't jump when switching (it was 40px until 2026-10-16) — with no vertical padding: logo block
  ☰ and Restore are centred on its full height (☰ stays, so the logo doesn't slide), tabs sit on its bottom edge, and the
  tab row's ::before/::after draw dividers next to the logo block and the right-hand buttons.
  `toggleFocus` re-scrolls the active tab into view after moving the row (a move resets scroll).
- Printing (app/print.js; design in docs/superpowers/specs/2026-10-15-print-dialog-design.md, look since 2026-10-17:
  2026-10-17-print-screen-design.md): Print button `#bPrint` (after Save), Ctrl+P, File > Print…, right-click
  "Print…" → `printCmd` → `SastraPrint.open({ doc, desk, toast, svg, parseRanges, savePdf })`. The **print screen**
  is laid out like Bohpum's: `.modal-bg.print-screen` fills the window under the logo row (`top:45px`), the row is
  `inert` + greyed meanwhile (☰/Alt/F10 already blocked by `.modal-bg`). Left column of big dropdowns
  (`select.big` = `<button><selectedcontent>` + options of picture · bold title · explanation, `bigOptions()`):
  `#prPrinter` (+ Copies, Printer Properties), `#prScope` (All / Current / Selected / Custom Print → `#prRangeF`;
  odd/even + reverse under it), `#prMode` Size / Poster / Multiple / Booklet with that layout's settings in `.pr-box`
  (`#prScale` Fit / Actual / Shrink / Custom %), `#prPaper` (A4 default, A3, A5, Letter, Legal), `#prOrient`,
  `#prSides` (one / long / short; Booklet sets it and locks it — on a layout change only `S.mode` changes, else the
  forced value would be read back as the user's), `#prColor` (colour / grayscale). Preview zooms like Bohpum's
  (`.pv-zoom` bar 10–400 %, Ctrl+wheel at the mouse, Ctrl+0/+/−, Space or middle-drag; the wheel flips sheets only
  while fitted). Footer: summary · Close · Save as PDF · Print. **Save as PDF** = the same sheets as printing
  (300 / 150 dpi JPEG; print itself is 600 dpi or the smart step-down; landscape sheets stay landscape) → `savePdf(name, bytes)` from index.html (`savePrintPdf`:
  `desk.saveDialog(…, 'pdf', the file's folder)`, title "Save as PDF"; browser: download), name `<name>-<paper>.pdf`.
  Settings live in localStorage `sastra-print` (not copies or page choice), same shape as before.
  `pickPages` and `planSheets` are pure (points, 5 mm margin) and exposed on `window.SastraPrint`, so
  tests call them directly. Printing draws every sheet with pdf.js (intent 'print') into `#printArea` as JPEG 0.92 at 600 dpi (since 2026-10-20,
  "acrobat look sharper"; A3 575 — a sheet never passes 64 MP) unless the job is heavy: `go()` draws up to 3 sample
  sheets (first, middle, last) at `printTopDpi(paper)`, estimates the job (their average size × sheets) and past 500 MB
  lowers the resolution, `printDpi` = floor(top × √(500 MB / estimate)), never below 150; samples at the final resolution
  are reused. Measured: 600 dpi PNG failed (50 noisy scans ≈ 11 GB, "Printing failed"); Chromium keeps each sheet's
  encoded data, so the cost follows bytes; the user's real reports at 600 dpi JPEG are 1.6–2.4 MB a page (a 200-page
  report ≈ 315–480 MB → still 600 dpi).
  Acrobat prints the page itself (vector); that was tried — a PDF in an Electron 44 window printed silently gives "Print
  job canceled" / "Failed to convert PDF: … PdfToEmfConverter" — so the sheets stay pictures. Save as PDF keeps 300 / 150
  dpi JPEG; landscape sheets are turned onto portrait paper
  (top to the left edge), so the printer always gets portrait pages of the chosen paper; `@media print`
  shows only `#printArea`. main.js `print` = `webContents.print({ silent:true, margins none,
  landscape:false, … })` with every option validated; Booklet "both sides" forces short-edge duplex.
  Electron's printer list has no default flag any more: main.js reads the Windows default printer
  from HKCU\…\Windows NT\CurrentVersion\Windows "Device". Properties = `rundll32
  printui.dll,PrintUIEntry /e /n <name>` (Windows printing preferences; what is changed there stays
  as that printer's default for the user — unlike Acrobat's per-job Properties). Without `desk`
  (plain browser) the printer rows are hidden and Print calls `window.print()`.
  Tests never print on paper: they swap main's `print` handler for `printToPDF` (see Status).
- No Windows message boxes anywhere (user's wish 2026-10-16: every popup should look like the app's own
  boxes — no title bar, no X). Questions use `askChoice(msg, [[label, 'outline'|'primary'], …], { detail,
  names })` in index.html (class `.modal.ask`; first button = Cancel = Esc/click outside; last has focus;
  returns the index); `askConfirm` is Cancel | ok on top of it. Only the system file pickers remain native.
- Saving several files (`saveMany`, Split "Save to folder", Export of 2+ pages): main.js `pick-folder`
  shows a folder picker (starts in the remembered save folder, shared with Save/Export) BEFORE anything is made and returns
  `{ dir }`. Then `name-clashes` (groups `[{ dir, names }]` → `{ count, message, detail }`) and, when names
  already exist, ONE `askChoice`: Cancel / Replace / Keep both (default: clashing names get the first free
  " (n)"); `resolve-names(groups, 'replace'|'keep'|null)` returns the final names (base names only,
  same-name parts in one batch numbered " (2)"). The page then makes each file and writes it at once with
  `write-file` (nothing big held in memory). One page of Export still uses the Save dialog. Plain browser:
  one download per file.
- Closing with unsaved changes asks in the app's own box (`askConfirm`, the same one as closing a tab):
  main's window `close` restores/focuses the window and sends `close-request`; the page asks ("… Close
  Sastra PDF anyway?", 2+ files listed), Esc = Cancel, then `close-now`. A second X while it's open is
  ignored (`closeAsking`).
- Explorer menu (design: docs/superpowers/specs/2026-10-15-explorer-menu-design.md; pictures:
  2026-10-17-explorer-images-design.md). Right-click PDFs and/or pictures (.jpg .jpeg .jfif .png .bmp .gif .webp
  — `EXTS` in explorer-menu.js = the manifest's ItemTypes = menu.cpp's list; the build script checks) →
  Sastra PDF ▸ Make PDF (exactly 1 picture) / Combine N files (2+ files, any mix) / Split here / Split to
  "name\" / Images here (JPG) / Images to "name\" (JPG) / Reduce file size (since 2026-10-20: `<name>_reduced.pdf` next
  to each PDF, task `reduce`, `reduceBatch` in task.js; DLL-only change, no manifest or package version change) (Split,
  Images and Reduce only for the PDFs in the selection; they act on the PDFs only). Make PDF = task `combine` with the one picture. The DLL (CLSID {47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}) gets ALL selected items
  in one Invoke, writes them to `%TEMP%\Sastra PDF\menu-*.txt` (UTF-8, a line each) and starts
  `Sastra PDF.exe --sastra-task=<combine|split-here|split-folder|images-here|images-folder|reduce> --sastra-list=<file>`
  through Explorer (IShellDispatch2, so the app doesn't run inside the package identity). main.js
  `handleTask` (first launch and `second-instance`): `readTaskList` reads only that folder/name pattern,
  deletes the file and sorts by name like Explorer (01, 02, 10). Combine → main window `combine-paths`
  → `combinePaths` (one unsaved tab: `<name>.pdf` for one file, else "Combined.pdf"; PDFs copied,
  pictures through `SastraImages.addImagePage`; in the opening progress box: "Combining 3 files · Adding file 2 of 3",
  unreadable files listed there (one readable file is enough; none → title "No PDF made"), Cancel = no tab;
  `d.saveDir` = the first file's folder, Save As starts there).
  Menu package 1.1.0.0 since 2026-10-17 (pictures): installing that update asks UAC once. Split/Images → `task-batch` to the task window (one per click, queued; "N more waiting"):
  per click it opens the PDFs, asks ONE "already there" question INSIDE the task window (`#ask` +
  Cancel / Replace / Keep both buttons; same `name-clashes` / `resolve-names` as Split/Export "Save to
  folder"; `task-focus` brings the window up), `make-dir` (only `<folder>\<one name>`), writes
  each file at once; problems are listed and keep the window open, otherwise it closes after 2 s; the app
  quits when no window is left. body[data-done] counts finished runs (tests wait on it).
  Windows coming up on a request (task window, task-focus, Combine, "Open with", first show) go through
  main.js `bringUp` (always-on-top for a moment, then off): plain show()/focus() left them BEHIND the program
  in front (Windows' foreground lock only flashes the taskbar) — every time when Sastra was already running
  (fixed 2026-10-16; test: a PowerShell form that takes the foreground and calls LockSetForegroundWindow). The window is as
  tall as its content (task.js ResizeObserver → `task-size` → `setContentSize`, 440 wide, 100–420 tall;
  the problem list scrolls past 216 px): 440 × 130 while working, no empty space. No Windows title bar
  (`frame:false`; Windows 11 still rounds the corners and adds the shadow): `.task` is a drag region
  (buttons and the problem list `no-drag`), Esc answers Cancel / stops the job / closes the finished window.
  Registration (`--explorer-menu=install`, before the single-instance lock, no window): Windows 11 and
  not `--silent` → re-runs itself elevated (`add-package`: `Add-AppxPackage -AllowUnsigned
  -ExternalLocation <install>`; UAC names Sastra PDF), then checks `Get-AppxPackage` AS THE USER; else
  (Windows 10, No, no admin, silent, failure) classic HKCU keys (`SystemFileAssociations\.pdf\shell\SastraPDF`
  ExplorerCommandHandler + `CLSID\…\InprocServer32`, MultiSelectModel Player). Never both. State in
  `HKCU\Software\Sastra PDF\ExplorerMenu` (Mode, Location, Version, Declined): a set-up package is kept
  without asking ONLY if Windows still starts it (`packageWorks`: CoCreateInstance of the CLSID from
  PowerShell), else it is added again (one UAC prompt). Found 2026-10-16: the 1.0.3 → 1.0.4 update deletes
  and re-makes the install folder; the kept package then got E_ACCESSDENIED on activation (no dllhost
  started, menu gone from Explorer, nothing in the event logs; PowerToys' PowerRename, the same kind of
  sparse package, still activated) until `--explorer-menu=add-package` (elevated) re-added it. Whether
  every update breaks it (folder re-made vs DLL replaced) is not known. Declined=1 stops repeat prompts
  until a full uninstall. `release` (old uninstaller on
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
  Electron, electron-updater, IBM Plex, Noto Sans Khmer (fonts: no version; files packaged by Fontsource), plus
  a note for the parts bundled inside them (electron-updater's 15 helpers with their licences — MIT, ISC, Python-2.0,
  Blue Oak; pdf.js's OpenJPEG, PDFium JBIG2 + Foxit fonts, qcms,
  Adobe CMaps, Liberation Sans; pdf-lib's UPNG and tslib; Electron's Chromium/Node.js/FFmpeg
  with LICENSES.chromium.html in the app folder; the installer's electron-builder and NSIS). Rows
  are [name, version, by, licence, link]; `scripts/check-credits.js` (postinstall) warns when a
  version there differs from node_modules. Update it when
  adding a library. Links use target=_blank, which main.js opens in the browser.
- What's new (`openNotes`, as in AI Hub; spec docs/superpowers/specs/2026-10-17-whats-new-design.md): the first start of a
  version this profile hasn't shown (update or new install) opens "What's new in X" by itself, after the start-up files are
  open; closing it in any way stores the version in localStorage `sastra-notes-seen`. Never over another `.modal-bg` box or
  Present (then the next start tries again). ☰ › Help › What's New (`whatsNew`) reopens it. Tags New / Improved / Fixed /
  Removed in that order, "See earlier versions ›" reveals the older entries; 900 px wide (AI Hub's wide window; 560 was
  too narrow for the user), the list scrolls, Close at the bottom. `<html data-notes="shown|none">` once decided — test
  launch helpers close it (`t\notes-skip.js`), since fresh test profiles see it once.
- Automatic updates (since 2026-10-17; spec/plan docs/superpowers/*/2026-10-17-auto-update*): electron-updater 6.8.9
  (the app's only runtime dependency), generic provider = package.json `build.publish.url`
  **https://sastra-update.smith89k.com/** (an R2 bucket's custom domain; NEVER change it — installed copies have it
  built in). PRIVATE since 1.1.1 (the user: "only people i give the file to can update"): Cloudflare Access lets in only
  the service token `sastra-pdf-updater`; the release job writes it into `update-config.json` ({ clientId, clientSecret },
  .gitignore'd, packed via build.files) and `createUpdater({ key })` sends it as `CF-Access-Client-Id/-Secret` on every
  request (latest.yml, installer, blockmap — proven by t\e2e with a server that refuses without it). No key (pnpm start,
  portable, local builds, 1.1.0) → no updater; Check for Updates says "This copy doesn't update itself. Copies installed
  from a Sastra PDF release do." No public download link: the user hands out the installer from the GitHub release.
  Only when packaged, on Windows, not portable. Checks 10 s after start and every 6 h, downloads quietly;
  failures only go to `%TEMP%\Sastra PDF\update.log`. Then the page's own box (`updateReady` → `readyBox`): "Sastra PDF
  X is ready to install." Later / Restart now, once per version per run, queued with `inTurn`/`whenFree` (never over a
  `.modal-bg` or Present, one at a time). Restart now asks `askUnsaved('Restart', 'Restart without saving')` FIRST
  (shared with the close question), then `install-update` → main sets `allowClose` and `quitAndInstall(true, true)`
  (silent, start again) — the installer starts at once and closes the app by force, so nothing may ask after it. While
  the task window is open it refuses (`installBlock` 'task'). If the installer didn't start (electron-updater leaves
  `quitAndInstallCalled` set only when it did), `install()` returns false, forgets the download and checks again, main
  sets `allowClose` back to false (else a later X would close unsaved PDFs without asking) and the page says "The
  update couldn't be started." Later + close = electron-updater installs on quit. The installer's menu hooks on a
  real update (electron-updater runs it with `--updated /S`, so installer.nsh does `release` then `install --silent`)
  were PROVEN on 2026-10-19 (1.1.1 → 1.1.2 on the user's PC): explorer-menu.log "install: package already set up",
  Get-AppxPackage SastraPDF.ExplorerMenu 1.1.0.0 Status Ok, Mode=package (t\e2e leaves the menu out on purpose).
  ☰ › Help › Check for Updates (`checkUpdatesCmd`): "Checking for updates…" (Esc drops the answer), then latest /
  downloading / couldn't check / only in the installed app / the ready box. Right-click menu after a silent update:
  explorer-menu.js `repairNeeded` (Windows 11, .msix present, Mode=classic, not Declined, `Asked` ≠ this version) → after
  What's new, "The right-click menu needs to be set up again." Not now (records `Asked`) / Set up (main runs
  `Sastra PDF.exe --explorer-menu=install` as a child, UAC, then reads the state) → toast.
- Design: IBM Plex Sans/Mono. All UI fonts SHIP INSIDE THE APP (no Google Fonts, no network: the
  README's privacy policy promises the app sends nothing anywhere on its own except the update check — keep it that
  way). copy-vendor.js builds app/vendor/fonts/fonts.css from @fontsource packages: Plex Sans
  400/500/600, Plex Mono 400/500, Noto Sans Khmer 400/500/600; Latin, Latin-ext and Khmer subsets,
  woff2 only (~370 KB). Khmer anywhere in the
  UI (tab and file names, toasts, the brand) uses Noto Sans Khmer: it sits second in the
  `--ui` and `--mono` stacks, then "Khmer UI" (Windows). Without it Chromium drew Khmer
  with Leelawadee UI (a Thai font) — keep a Khmer font in any new font stack. Accent = the logo's red
  (since 2026-10-17, was terracotta): light `#cc2229` (one step deeper than the logo's #E82830 so white button text
  is 5.5:1), dark `#ff5c61` with `--accent-fg` `#1f0a0b`; every accent use reads `--accent`/`--accent-soft`/
  `--accent-fg` (index.html and task.html — keep both in step). Light and dark themes via CSS tokens. Both side panels use
  `--chrome` (the grey of the top and status bars); inside the Tools panel `--chrome` is
  redefined to `--panel`, so its buttons/fields/lists become lighter cards on the grey.
- Tools panel sections (since 2026-10-17, "like acrobat"; spec 2026-10-17-tools-fold-design.md): Organize pages, Split
  document, Export as images, Combine files (moved last at the user's wish). Each `<h3>` holds a `.tsec-head` button
  (icon + name left, `up` chevron right, turned 180° when folded, `aria-expanded`) that folds only its section
  (`.tsec.folded`: all but the heading hidden). Folded keys (`data-sec`) in localStorage `sastra-tools-folded`, restored
  by a tiny inline script right after `</aside>` (no flash). The no-PDF switch-off in `updateUI` skips `.tsec-head`, so
  headings fold with no PDF open.
- Dropdowns, tick boxes, round options: the app's own look, as in Bohpum (E:\_httdocs\Bohpum src/app.css) — since
  2026-10-17. `select, ::picker(select){appearance:base-select}` (Chromium customizable select): the box keeps
  `.field select` / `.zoomsel`, plus a chevron (`::picker-icon`), a floating `--panel` list, `::checkmark` in red.
  Check boxes / radios: `appearance:none`, 16 × 16, ticked = `--accent` + `--tick` (an SVG per theme). An open list
  has the focus on an `<option>`, so `isInput` counts anything inside a `<select>` (else Delete deleted pages while
  choosing), and print.js `keys` / the right-click menu ignore keys while `select:open`. The printer box starts with
  `<button><selectedcontent>` (print.js `PICKED`) so long names end in "…"; rebuild it with `PICKED` when refilling.
- Native feel: UI text can't be selected (`user-select:none` on body, arrow cursor, logo not
  draggable); text inputs are the exception and still select/edit normally.
- Theme switch: menubar button cycles System → Light → Dark (`setTheme`), saved in localStorage
  `sastra-theme` and applied by a tiny head script before first paint (`data-theme` on <html>;
  System = no attribute, follows the OS). In Electron the page tells main (`set-theme`), which
  sets `nativeTheme.themeSource`, repaints the caption buttons (`paintBar`) and ticks View > Theme; that menu sends
  themeSystem/themeLight/themeDark back to the page. The page owns the choice.
- No PDF open: the tab row is hidden (no "+"); everything else stays visible but every control
  in the toolbar and Tools panel, plus Maximize, is disabled (start of `updateUI`; it marks the
  ones it switched off with `data-nodoc` and re-enables exactly those). ☰, Open and the theme
  switch stay usable. F and the right-click menu do nothing; closing the last PDF while
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
  Until billing is fixed, release by hand the same way (now `pnpm run dist`), after running the Playwright checks.
- **Releasing since 2026-10-17** (the user upgraded GitHub to Pro that day to clear the billing block): to Cloudflare R2
  through GitHub Actions, by hand only (docs/updates-setup.md). `pnpm version X.Y.Z --no-git-tag-version
  --no-git-checks` (unlike npm, pnpm refuses a dirty working tree without `--no-git-checks`; it only edits package.json)
  (title, About and installer name follow package.json), write the new version's entry at the top of app/notes.js with
  the release date (What's new; `pnpm run dist` and the workflow refuse to build without it, and it becomes the GitHub
  release notes via scripts/release-notes.js), run the Playwright checks locally, push main, then Actions → Release →
  Run workflow → the version (`gh workflow run release.yml -f version=X.Y.Z`). The job stops if the version ≠
  package.json, is already released, an R2 secret is missing, or that version's installer is already in R2 (an
  earlier run stopped half-way: bump the version — a rebuild would put different bytes under the same name);
  the R2 key and GH_TOKEN live only in the env of the check / upload / prune / release steps (never install or
  build steps: that key can push an update to every installed copy); a step writes the update key (CF_ACCESS_*) into
  update-config.json before the build; builds with `--publish never`; uploads installer + blockmap, then `latest.yml`
  (no-cache) LAST, checking each stored size; then checks the address answers non-200 without the key and serves this
  version's latest.yml with it; removes older `Sastra-PDF-Setup-*.exe` and the old public copy `Sastra-PDF-Setup.exe`
  (never a .blockmap); creates tag + GitHub release (installer + SHA-256). Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY, R2_BUCKET, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET. The installer is named
  `Sastra-PDF-Setup-<version>.exe` (dashes: latest.yml names it so).
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
  Not tested: a real Windows 10 PC, a PC without admin rights. (The local `dist\Sastra PDF Setup
  1.0.2.exe` was rebuilt with the menu on 2026-10-15, so it is NOT the released 1.0.2.)
  Found on the way and fixed 2026-10-16: pdf.js 6's PDFDocumentProxy has no destroy() (it's on the loading
  task), so `d.pdf.destroy()` threw silently and every edit kept the old copy in memory. Now
  `SastraOps.closePdf(pdf)` (= `pdf.loadingTask.destroy()`) in loadPdf and closeDoc; a closed doc's
  getPage() throws synchronously (not a rejected promise).
- **Released v1.0.3 on 2026-10-16**: Explorer right-click menu, progress window (frameless, fits its
  content, PDF file icon, question inside it), no Windows message boxes, close question in the app's style,
  memory fix. `dist\Sastra PDF Setup 1.0.3.exe` (114 MB, unsigned) passed, packaged: menu 43, folder 23,
  print 71, pdfops 10, close 12, DLL harness 20; title "Sastra PDF v1.0.3", About "Version 1.0.3". The real
  installer was run over the user's 1.0.2 (UAC Yes → package mode, Location
  `%LOCALAPPDATA%\Programs\Sastra PDF`) and the user checked Images, Split (twice: question inside the
  window), Combine and the close box from the installed copy. The tag's workflow run was again blocked by
  billing, so it was uploaded with `gh release create v1.0.3 … --notes-from-tag`; asset
  `Sastra.PDF.Setup.1.0.3.exe` SHA-256 75a716de…072bfb (matches GitHub's digest).
  Note: someone pushed main from this PC on 2026-10-16 00:22 (probably VS Code sync), before the release.
- **v1.0.4 built 2026-10-16, not released yet**: `dist\Sastra PDF Setup 1.0.4.exe` — first build (SHA-256
  67b7aaeb…8a1443) was installed by the user over 1.0.3 and lost the right-click menu (see Explorer menu:
  `packageWorks`); the user's PC was repaired by re-adding the package (UAC Yes). Rebuilt 14:52 with the
  fix (114 226 245 bytes, SHA-256 926b7f46…940513); unit 28, packaged menu 43 passed. Not yet run: this
  rebuilt installer over the installed 1.0.4 (should keep the menu, asking UAC once if Windows refuses it). Version bumped from 1.0.3 so the build wouldn't overwrite the released 1.0.3
  installer. The packaged `dist\win-unpacked` passed titlebar 43, front 6, combine/open-with front 7, bar 19,
  menu 43, close 12, folder 23, ops, print 71; title "… — Sastra PDF v1.0.4", About "Version 1.0.4".
  Not run: the real installer over the user's installed 1.0.3. Changes: app's own title bar (same height maximized or not, ☰ menu), Maximize
  (F) row 45 px like the normal row, the progress window / Combine / "Open with" come to the front
  (`bringUp`), floppy-disk Save icon, Full screen button removed. Passed from source: titlebar 43 (+ the
  MOUSE=1 part, checked once), front 6, combine/open-with front 7, bar 19, menu 43, close 12, folder 23,
  ops, print 71 (print-test's layout check now 1217 px up and it reads the default printer from the registry
  — Windows manages it here and it moved from the Canon to the HP M855 on 2026-10-16; menu-test's menu-row
  check now expects no row on either window).
- **v1.1.0 built and installed 2026-10-17, not released yet** (branch feat/explorer-images, not merged): new logo +
  .pdf icon, pictures in the Explorer menu (Make PDF / Combine any mix; menu package 1.1.0.0), accent = the logo's red,
  Bohpum-style dropdowns / tick boxes, installer refreshes Windows' icon cache. Specs + plans in docs/superpowers
  (2026-10-17-*). Version 1.1.0 chosen by the user (1.0.4 was never released, so it was skipped).
  `dist\Sastra PDF Setup 1.1.0.exe` (113 958 331 bytes, SHA-256 0f730535…f4aacd). Passed from source AND packaged:
  colour 11, controls 15, images 61 (all 8 EXIF orientations drawn by pdf.js = what Chromium shows), menu 51,
  unit 38, DLL harness 39, ops 10, folder 23, print 71, close 12 (packaged: once the test lost the window as the
  app closed — a test race; 12/12 on two re-runs), titlebar 43. Installed over the user's 1.0.3 (UAC Yes →
  `install: package added`, package 1.1.0.0 starts). The user checked on the real menu: Make PDF on one photo
  (upright), Combine 3 files right-clicking a picture and right-clicking the PDF of the same mixed selection, the red
  look, the new controls and the new icons (shortcut, Start, taskbar) — "all pass".
  Merged to main locally (not pushed). Then the Bohpum-style print screen (spec/plan 2026-10-17-print-screen-*), built
  on branch feat/print-screen and merged to main locally the same day (not pushed). Since then: **work on main only**
  (the user's rule, 2026-10-17 — no feature branches; still ask before pushing or releasing).
  `dist\Sastra PDF Setup 1.1.0.exe` rebuilt 13:41 with it (113 963 322 bytes, SHA-256 0b1ea3de…77ef70), NOT
  installed yet (the user said "Not now"); passed from source and packaged: print-screen 38, print 71, controls 15,
  colour 11, images 61, menu 51, unit 38, ops 10, folder 23 (packaged: once "current page" was 2, not 1 — scroll timing
  in the test; 23/23 on two re-runs), close 12, titlebar 43.
  Tests live in the 2026-10-17 session scratchpad `t\` (…\4e4e0838-…\scratchpad\t; pictures.js makes the test
  pictures; print-test empties `t\out\`, and titlebar-test needs `t\out\ten.pdf` — copy it from `t\pdfs\` first).
  Then (2026-10-17, on main, no installer built — the user: "not yet build exe"): no red selection frame while maximized
  (focus-outline 5), and the What's new window (spec/plan 2026-10-17-whats-new*; 900 px after "make it wider"). Passed
  from source: whats-new 22, notes-unit 23, titlebar 43, controls 15, colour 11, close 12, folders 7, nozip 23,
  pages-panel 15, print-screen 38, print 71, images 61, menu 51, ops 10. Every suite's launch now calls
  `t\notes-skip.js` (fresh profiles see What's new once). Then the Tools panel sections fold (and Combine moved last):
  tools-fold 20, notes-unit 23, whats-new 22, controls 15, colour 11, nozip 23, folders 7, ops 10, images 61,
  titlebar 43 (once 2 failures: print-test had emptied `t\out\`, so no PDF opened — copy ten.pdf back first).
- **pnpm (2026-10-17) and automatic updates (2026-10-17, on main, pushed to GitHub 2026-10-17 with the opening progress box; Cloudflare set up the same day: bucket `sastra-pdf-updates`, domain sastra-update.smith89k.com answers 404 until the first release, token `sastra-pdf-release`, the 4 GitHub secrets set). **Released v1.1.0 on 2026-10-17** through GitHub Actions (run 39043889948, every step passed — the billing block is gone): R2 has Sastra-PDF-Setup-1.1.0.exe + .blockmap, the fixed-name copy and latest.yml (no-cache); installer 113 315 931 bytes, SHA-256 fa1f5096…bda0a1 = the downloaded link. The fixed link shows `max-age=14400` (the zone's Browser Cache TTL) but `cf-cache-status: REVALIDATED`, so the edge never serves an old copy. **Released v1.1.1 the same day** (run 39046511289): the address is PRIVATE (Cloudflare Access app `sastra-update`, policy "Sastra PDF app only" = service token `sastra-pdf-updater`); the job logged "Locked (without the key: HTTP 403); with the key: version 1.1.1" and removed Sastra-PDF-Setup-1.1.0.exe and the old public Sastra-PDF-Setup.exe; installer SHA-256 ae82cf19…84f3b9 on the GitHub release. 1.1.0 has no key, so its copies install 1.1.1 by hand once. **Released v1.1.2 on 2026-10-18** (run 39096372123, every
step passed; "Locked (without the key: HTTP 403); with the key: version 1.1.2"): Rotate/Delete left the top toolbar.
Installer 113 316 957 bytes, SHA-256 095dbcf8…2053cf on the GitHub release. It is the first version installed 1.1.1
copies should fetch by themselves. **Seen on the user's PC on 2026-10-19** (update.log): 1.1.1 found 1.1.2 at
08:58, downloaded 3 % of it through the blockmaps (3 262 of 110 661 KB), Restart now → silent install, the right-click
menu kept. The same copy's checks after the history rewrite and force-push (12:47) still say "latest version: 1.1.2"
— installed copies never look at GitHub.** Tests live in the
  2026-10-17 session scratchpad `t\` (…\59bf0bdb-…\scratchpad\t; the older 4e4e0838 folder is gone): unit
  (`node --test t\unit\*.test.js`: updater 8, menu-repair 2, release 3), main-wiring (from source; `PACKED=1` uses
  `t\pack` from `pnpm exec electron-builder --win nsis --publish never "-c.directories.output=<t>\pack"` — app-update.yml
  is only written for nsis, not `--win dir`), update-ui 24, menu-repair-ui 11, close-check 3, packcheck (what app.asar
  holds), wfcheck (workflow YAML + `bash -n`), and `t\e2e\run.js`: a REAL update with a separate test app (see gotchas).
  `t\launch.js` (playwright-core 1.64.1) closes What's new on fresh profiles. Then the opening progress box:
  `t\open-progress-test.js` (TASKS=1,2,3,4 picks groups; swaps main's read-file for a delayed one; makes `t\pdfs\`
  p1–p20, q1–q5, big.pdf 3000 pages + copies, bad.pdf) — all pass, with update-ui, menu-repair-ui, close-check, main-wiring.
- **Open source tried and undone, 2026-10-19**: the user asked "go open source like bohpum to get code-signing" (GPL 3.0,
  About's license line, a five-job release with SignPath, 1.1.3; commits c16588a…655e43b), the repository was made
  public, then private again the same day ("undo to private"), and every file went back to the 2026-10-18 state ("back
  to before we plan to go public"; done with `git revert`, so the work is still in git history). Stays private; no
  SignPath. What stays from it: the history clean-up — the work-document names and the Gmail address were rewritten in
  every commit and tag and force-pushed (backup bundle `E:\_httdocs\SastraPDF-old-history.bundle` on this PC only;
  this repo's `user.email` is GitHub's private `7828470+smith89k@users.noreply.github.com`). The six merged pull
  requests on GitHub still hold the OLD commits (PR #5's diff shows the work-document names, all show Gmail); only
  GitHub Support can remove them. The README still has MIT; its 2026-10-15 "Code signing policy (applied for)" section
  became "Signing and privacy" with the Microsoft Store work (below).
- **Microsoft Store work (2026-10-19 →)**: plan docs/superpowers/plans/2026-10-19-microsoft-store.md. menu.cpp starts the
  app directly when its DLL runs inside the Store package (`InStorePackage`), so the app runs in that package too.
  Tasks 1–9 done on 2026-10-19 in a Linux cloud session (Claude Code on the web), not on the user's PC. Commits on main:
  f58d0b1 store.js, c164988 updater.js store gate, c097e62 main.js/page wiring, 45718c4 menu.cpp `InStorePackage`,
  e48b893 Store build config + manifest + build/appx logos (made there with Python Pillow: the 3 square logos copied from
  explorer-menu/Assets, Wide310x150 = the 150 px logo centred, PdfFile.png = build/pdf-file.png at 256 px Lanczos),
  a3d7f2e scripts/menu-sources.js, df93b18 scripts/store-check.js, b90cf18 release.yml (checks store.json; after the
  installer it deletes update-config.json, builds the Store package, runs store-check and attaches the .msix to the
  GitHub release, never R2), then the docs (updates-setup.md section 7, docs/store-listing.md, README). Passed there:
  unit store 5, updater-store 1, store-config 5, menu-sources 2, store-check 2, release-workflow 3; store-wiring-test 6
  (Electron under xvfb); drop-test 42 still passes. The new menu.cpp function was only compile-checked with mingw-w64
  (no MSVC there).
  **On the user's second PC (repo at C:\_httdocs\SastraPDF, no E: drive), 2026-10-19 evening:** `pnpm run build:menu` with
  MSVC builds menu.cpp (with `InStorePackage`) cleanly. The test folder was made again from the two plans' code (`T` =
  that session's scratchpad `t\`, …\c---httdocs-SastraPDF\624e0a35-…\scratchpad\t; `t\root.js` finds C: or E:): unit 18,
  store-wiring 6, drop-test 42 — all pass. Three Windows-only test fixes (the app was right each time): Playwright
  1.48 starts Electron through a shell on Windows, so `app.process().kill()` ends only the shell — `quit()` now runs
  `taskkill /PID <electron pid> /T /F` and waits (else the relaunch with the same profile hands its files to the old
  window and exits); `waitForLoadState('load')` after `firstWindow()` (an early evaluate died with "Execution context was
  destroyed"); Chromium 152 ignores `effectAllowed`/`dropEffect` writes on a script-made `DataTransfer`, so the test's
  ones get own writable properties that record what the app sets. Store screenshots (store-shots.js, 2802 × 1577 at
  175 %) in `t\shots-store\`; it swaps main's `printers` handler for made-up ones ("Office Printer", "Colour Laser") —
  the user's wish: no real office printer names in public screenshots. NOT run there: the DLL harness and the old suites (controls, pages-panel, titlebar, close,
  images) — the old test folder (4e4e0838) is gone from this PC.
  NOT done yet (needs the user's Windows PC): the DLL harness; close-test.js; Task 10
  (the sideloaded test package on the user's PC, WACK); the rest of Task 11 (screenshots; the privacy policy needs no web page: Partner Center takes it as text, as for
  Bohpum — docs/store-listing.md) and Tasks 12–13
  (release 1.2.0 with its What's new entry, submission, then Store-only releases).
  store.json (2026-10-19, from the user's Partner Center › Product identity; name "Sastra PDF" reserved):
  smith89k.SastraPDF, CN=AAA3A883-09DC-4D02-89C9-CD2286F692F0, "Taing Sunnguon", Store ID 9P768LL4RTVP (Store page
  apps.microsoft.com/detail/9P768LL4RTVP; Check for Updates opens ms-windows-store://pdp/?ProductId=9P768LL4RTVP).
  Same publisher as Bohpum. With it the release workflow's store.json check passes.
  Known from review: in the real Store copy main.js sets userData itself, so a `--user-data-dir` test switch is
  overridden (Task 10 test runs share the "Sastra PDF Store" profile); Wide310x150Logo.png is in the package but the
  manifest doesn't reference it (no wide tile; harmless on Windows 11); the release now stops before R2 if the Store
  build fails. Task 10's first test package showed the taskbar icon in a box (the user, 2026-10-19: "taskbar icon: box"):
  only the plated 44 px logo existed. build/appx now also has `Square44x44Logo.targetsize-N.png` and
  `…targetsize-N_altform-unplated.png` for N = 16 20 24 32 40 44 48 64 256 — the PNG entries of build/icon.ico (the
  installer copy's taskbar icon) byte for byte, 44 = Square44x44Logo.png. Any `.targetsize-` file makes electron-builder
  run makepri (resources.pri), which is how Windows finds them.
  **Task 10 done 2026-10-19 on the user's second PC:** `SASTRA_STORE_SIDELOAD=1 pnpm run dist:store` → Sastra-PDF-Store-1.1.2.msix
  (167 MB; store-check passed), `Add-AppxPackage -AllowUnsigned` (UAC) → SastraPDF.StoreTest 1.1.2.0 Ok. Started from the
  Start menu it runs from C:\Program Files\WindowsApps\SastraPDF.StoreTest_…\app with userData "Sastra PDF Store"; "Open
  with" opened A.pdf in it; the right-click menu's Images here wrote A_page-1…5.jpg; the user confirmed the rest ("yes").
  After the rebuild with the unplated icons the taskbar logo has no box. Microsoft's checker (appcert, 24 tests):
  OVERALL_RESULT PASS; only the optional "Blocked executables" flags CreateProcessW in Sastra PDF.exe and SastraMenu.dll
  and "Reg"/"Cmd" strings in chrome_200_percent.pak (Electron; doesn't fail the result). Test package removed.
  **Released v1.2.0 on 2026-10-19** (the user: "i want to submit to microsoft store", "follow the bohpum app to the
  store"; run 39258455294, every step passed; "Locked (without the key: HTTP 403); with the key: version 1.2.0"): the
  last installer (SHA-256 d88fb3c0…dd7c62) to R2 + Sastra-PDF-Store-1.2.0.msix (167 267 846 bytes, SHA-256
  a6e140ea…435c27) on the GitHub release. The older suites were NOT run before it (not on this PC). Then, as Bohpum did
  right after its 0.2.4, the release job became Store-only (Task 13; scripts/r2-prune.js deleted) without waiting for
  Microsoft to publish. **Submitted to the Microsoft Store on 2026-10-19** (filled in by Claude in Chrome at the user's
  wish, "do for me like bohpum"; the user dragged the .msix in, then said "yes" to Submit): Free, all markets; category
  Productivity; privacy policy as TEXT (Partner Center asks for one because of runFullTrust, even after "No personal
  information" — it switches the answer to Yes itself); IARC 3+ / Everyone; English listing from docs/store-listing.md
  with the 3 store-shots screenshots; runFullTrust reason ≤ 500 characters; testing notes on Additional Testing
  Information. Status "In certification" (usually hours, up to 3 business days); publishes as soon as it passes.
- **Sharper pages (2026-10-20, on main, not released)**: ClearType text on screen and 600 dpi print (JPEG 0.92, smart size
  check: up to 3 sample sheets estimate the job, past 500 MB the dpi steps down, never below 150; A3 575) (spec/plan
  2026-10-20-sharper-pages*). Tests in this session's scratchpad `t\` (…\c2983e9f-…\scratchpad\t; the older suites were
  copied there from 4e4e0838; titlebar-test also needs the `*.ps1` helpers copied from there): sharp-screen, sharp-print,
  print-memory (text200 at 600 dpi, scan50 steps down), print 71, print-screen 38, controls 15, titlebar 43, pages-panel 15,
  ops 10. Not yet: the user's side-by-side check with Acrobat on screen and on paper.
- **Reduce file size (2026-10-20, on main, not released)**: Save ▾ (Save / Save As… / Save as Reduced Size PDF…) and
  File Explorer › Reduce file size (spec/plan 2026-10-20-reduce-size*). Passed from source: reduce-test (pack, pictures,
  the user's Khmer PDFs: the 2015 PwC report 33.6 MB → 9.7 MB, text identical), save-menu-test, reduce-menu-test,
  menu-sources unit, DLL harness 40 (built from Git Bash with `cmd //c ".\\build.bat"`), and the older nozip,
  folders, close, controls, titlebar, images suites (tests in this session's `t\`, …\c2983e9f-…\scratchpad\t). menu-test: 45 of 48 — the 3
  Combine "Couldn't read: …" toast checks fail the same way at 7e4d656 (before this work): the problems now show in
  the opening progress box (2026-10-19), not in the toast; the test is stale. The installed
  copy's right-click menu gets the entry only with a new release (new DLL); no UAC prompt (manifest unchanged).
  The new right-click entry reaches users only with the next Microsoft Store release (the DLL ships in the package);
  copies installed with the 1.2.0 installer never get it.
  Needs a What's new entry in app/notes.js at release time.
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
- pnpm layout (since 2026-10-17): node_modules holds only our own packages, each a LINK to its real folder
  in node_modules/.pnpm; everything else sits next to the package that needs it there. So a script that looks
  for a package we don't list (pako, @electron/get) must start from `fs.realpathSync` of the one that pulls it
  in (check-credits.js, ensure-electron.js), and Windows tar won't unpack through the link
  ("Cannot extract through symlink"), so ensure-electron.js works in electron's real folder.
- Testing a real update without touching the user's install: `t\e2e\make-config.js <version> <outDir> <url>` turns the
  build config into "Sastra PDF E2E" (own appId, productName, `extraMetadata.name` → own userData, lock and
  `<name>-updater` cache; no shortcuts, no fileAssociations, no extraResources, no nsis.include so the menu is never
  touched); build 9.0.0 and 9.0.1 with `--config`, serve 9.0.1 with `t\e2e\serve.js`, `t\e2e\run.js` installs/updates/
  uninstalls it. `asar.extractFile` needs Windows `\` paths.
- pnpm skips our postinstall when node_modules is already up to date: to refresh app/vendor run
  `pnpm run postinstall` (or delete node_modules and `pnpm install`).
- `pnpm run dist` can fail with "EPERM: operation not permitted, rename dist\win-unpacked.tmp" right
  after the old build was run or tested (antivirus/indexer still holding files). Delete
  `dist\win-unpacked.tmp` and run it again; the retry worked.
- Electron binary: Electron 42+ doesn't download electron.exe on install (only on first run),
  and Electron 33's installer stalled on Node 24. `scripts/ensure-electron.js` (postinstall) fetches
  the checksummed zip via `@electron/get` and unpacks it with `C:\Windows\System32\tar.exe`
  (Git Bash's GNU tar can't read .zip).
- Electron 43+: open/save dialogs without `defaultPath` always start in Downloads and the OS no
  longer remembers the last folder, so main.js remembers them itself: `folders` { open, save } in
  `<userData>\folders.json` (kept across restarts since 2026-10-17 — the user: "open file always to download folder";
  before that it was memory only, so every fresh start showed Downloads). `startIn(kind)` → that folder if it still
  exists, else Documents; `remember(kind, dir)` after Open / Save / Export / pick-folder, and for files opened from
  Explorer ("Open with", argv, second instance). Test: folders-test.js.
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
- Test windows come to the front: keys the user types meanwhile can land in them (2026-10-17: a Backspace typed
  in another app deleted a page in controls-test's window). A one-off "page count dropped / dirty" failure while
  the user was typing is that, not a bug — re-run it.
- `pnpm run dist` needs Visual Studio Build Tools (C++ x64) + the Windows SDK for the Explorer menu
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

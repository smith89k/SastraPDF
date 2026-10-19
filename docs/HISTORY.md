# Sastra PDF — project history

A record of the conversation with Claude (claude.ai, 14 October 2026) in which this project was
planned and built. Summarised in order; the user's requests are quoted as written.

---

### 1. "can i build app like acrobat pro for PDF file that can combind, split, remove, export image"
Claude said yes: those four features are the easier part of Acrobat (free libraries handle them);
the hard parts (editing text inside PDFs, OCR, digital signatures) weren't needed.

Options given:
- **Web app**: pdf-lib (merge/split/remove) + pdf.js (thumbnails, render pages to PNG/JPG).
  Runs locally, no server, files never uploaded. Fastest first version.
- **Windows .NET/C#**: PdfSharp (MIT) + PDFium (PdfiumViewer / Docnet.Core).
- **Python**: pypdf + PyMuPDF, GUI with PySide/Tkinter.

Cautions: PyMuPDF and iText are AGPL (commercial licence needed for a closed or sold app).
"Export images" can mean rendering each page as a picture, or extracting the photos embedded in
the PDF — different code; decide which (or both).

### 2. "i want closely the same acrobat pro, with hand pull, maximizing with multiple pdf on top as tab"
Claude built a full web app and published it as a claude.ai artifact:
- Document tabs across the top (open many PDFs; dot marks unsaved changes; + opens more).
- Hand tool (H / hold Space / middle mouse) to drag the page; Ctrl+wheel zoom; Fit width/page.
- Maximize (F) hides side panels; full-screen button.
- Thumbnail sidebar: click/Ctrl/Shift select, drag to reorder.
- Tools panel: rotate, delete, extract, insert file; Combine open files in a chosen order;
  Split every N pages / by ranges ("1-3, 4, 5-8") / one file per page, to new tabs or a ZIP;
  Export pages as PNG/JPG at 72/150/300 dpi (several pages → one ZIP).
- Undo/redo, keyboard shortcuts, light/dark themes, two generated sample PDFs on first open.
- Limits noted: no text editing; "export images" renders whole pages (doesn't extract
  embedded photos).
It was first named "Folio PDF".

### 3. Naming
"did you name it Folio PDF?" → yes, Claude's own invented name.
"Suggest khmer name related" → suggestions: សាស្ត្រា (Sastra, palm-leaf manuscripts),
ក្រាំង (Kraing, folded-paper manuscript), ស្លឹករឹត (Slek Rith), ទំព័រ (Tumpoar, "page"),
ឯកសារ (Aeksar, "document"), បណ្ណ (Bann). Claude recommended Sastra.
User chose: **"Sastra PDF (សាស្ត្រា PDF)."** The app was renamed; the top bar shows
"Sastra PDF" with សាស្ត្រា beside it in Noto Sans Khmer.

### 4. "is it native window?"
No — it was a web app in a browser page. Options to make it native: Electron (reuse the same
code; installer ~80–100 MB), Tauri (same code, ~5–10 MB, more setup), or a C#/.NET rewrite with
PDFium. Claude recommended Electron.

### 5. "i want to move this project to the folder"
User chose **E:\_httdocs** (drive "4TB"). Claude created `E:\_httdocs\SastraPDF` with the web
app as index.html and a README. Downloading the libraries for offline use was blocked by the
network in Claude's workspace, leaving an empty `vendor` folder.

### 6. "ok build with electron"
Claude wrote the Electron project (see CLAUDE.md for the layout): main.js, preload.js,
app/index.html (desktop-aware version of the app), package.json with electron-builder NSIS
config and .pdf file association, a generated icon, build.bat and run.bat. The web version was
moved to `web/index.html`, the empty `vendor` folder to `app/vendor`. It could not be installed
or built from Claude's side (network blocked; installer must be built on Windows), so it is
untested.

### 7. "move the converation to the folder and i will open with claude code"
This file and CLAUDE.md were written so Claude Code has the full context.

### 8. First run and build on Windows (Claude Code, 2026-10-14)
"continues the work" → Claude Code ran the next steps from CLAUDE.md.
- `npm install` reported success but Electron's binary was never unpacked: on Node 24.16 its
  unzip library stalls and exits silently. Added `scripts/ensure-electron.js` to postinstall,
  which unpacks the cached download with Windows' tar.exe. Verified on a clean reinstall.
- The Claude Code shell had `ELECTRON_RUN_AS_NODE=1` (inherited from VS Code); run.bat and
  build.bat now clear it. Both .bat files converted to CRLF line endings.
- Drove the real app with Playwright (scripts kept outside the project). Found and fixed:
  at high zoom the page widened the whole layout, pushing the Tools panel off-screen and
  breaking sideways panning; stray scrollbars on Windows in the tab row, Pages panel and the
  split inputs. Fixes applied to both app/index.html and web/index.html.
- `npm run dist` built `dist\Sastra PDF Setup 1.0.0.exe` (82 MB, unsigned). The packaged app
  passed the same checks as `npm start`.

### 9. New logo (Claude Code, 2026-10-14)
"here is the logo" → the user supplied `logo.png` (1254 px). Claude Code cleared the stray red
pixels in its transparent area, cropped it to the tile and made `build/logo.png` (1024 px master),
`build/icon.ico` (16–256 px), `build/icon.png` (512 px) and `app/logo.png` (64 px). The old
CSS-drawn page mark in the menubar was replaced by the logo in both app/index.html and
web/index.html, which also got a favicon. The installer must be rebuilt (`npm run dist`) to
carry the new icon.

The supplied logo had a red swirl "A" on the page that is very close to Adobe's Acrobat
trademark. At the user's request it was painted out and replaced by a plain red "PDF"
(Inter Black, OFL font) in all icon files. The root logo.png is left as the untouched original.
`npm start` was also run on the user's Mac (npm install, Electron 33.2.1 binary was fine there);
the new logo shows in the menubar.

### 10. Maximize fixes (Claude Code, 2026-10-14)
- "click maximizing without file open, it have black screen": hiding the menubar shifted every
  grid child up one row, so the workspace landed in an `auto` row and collapsed to 48 px (with
  files open the pages happened to fill it). `#app` now uses named grid areas.
- "should keep logo and app name and move pdf tab after the logo": in Maximize mode the tab row
  now sits in the menubar after the logo, with Restore and Full screen on the right.
- Also fixed: Maximize zoomed around the view's centre, hiding the top ~220 px of the page you
  were reading; an automatic refit now keeps the top edge in place (manual zoom still centres).
- Checked in headless Chrome and in the real Electron app (playwright-core `_electron`, scripts
  outside the project), both with no file open and with files open, plus restore.

### 11. Theme switch, no "+" without a PDF (Claude Code, 2026-10-14)
- "is there a dark and light mode?" → there were both, following the OS only. "add theme
  switch": a menubar button cycles System / Light / Dark, remembered between runs, plus
  View > Theme in the desktop menu; Electron's title bar follows via nativeTheme.
- "without pdf open, shouldn't have + on tab bar, it should show only 'Open a PDF' box": the "+"
  appears only once a PDF is open, and the empty tab row is hidden.
- Also fixed: after closing the last file, the Organize panel still said "actions apply to the
  current page (1)"; it now goes back to its default hint.
- Checked in headless Chrome (app and web) and in the real Electron app (button ↔ menu ↔
  nativeTheme in sync, choice survives reload, saved choice reset to System after the test).

### 12. Maximize hides the toolbar; right-click menu (Claude Code, 2026-10-14)
- "when maximizing should hide this bar" + "Everything in right click panel": Maximize now also
  hides the view toolbar, and a right-click menu on the page area carries everything from it
  (tools, zoom dropdown, zoom in/out, actual size, fit width/page, page number, previous/next,
  rotate, delete, panel toggles, Maximize/Restore), in both normal and maximized views.
- Right-clicking a page that the actions would not touch selects it first, so Delete/Rotate hit
  the page you clicked. Delete shows the count ("Delete 2 pages") when several are selected.
- Checked in headless Chrome (dark + light, app and web) and in the Electron app.

### 13. Empty state shows only the box (Claude Code, 2026-10-14)
"when no pdf opened, should show only box 'open pdf to get started', everything none": with no PDF
open, the toolbar, both side panels, status bar and the Open/Save/Undo/Redo/Maximize/Full screen
buttons are hidden. The logo row stays (logo, name, theme switch), since the user wants the
branding kept. F and right-click do nothing without a PDF; closing the last PDF while maximized
returns to the normal empty screen. Checked in Chrome (app + web) and Electron.
- Follow-up, "give them back, and just disable them": the bars and buttons are visible again with
  no PDF open; every control in the toolbar and Tools panel and the Maximize button is disabled
  instead (Open, theme switch, Full screen stay usable; the tab row stays hidden).

### 14. No text selection (Claude Code, 2026-10-14)
"disable text select to make it look native": UI text can no longer be selected by drag,
double-click or Ctrl+A, the cursor stays an arrow over labels, and the logo can't be dragged out.
Text fields (page number, pages per file, ranges) still select and edit. Checked in Chrome (app + web).

### 15. Toolbar in the logo row (Claude Code, 2026-10-14)
"i think tool bar should be along side with the logo to save space": the view toolbar moved into
the logo row (between Undo/Redo and Theme), so with a PDF open the page starts 41px higher. To fit
common Windows widths the row drops, as it narrows: button labels (<1440px), Fit width/page
(<1280), the Khmer name (<1200, top bar only), Zoom −/+ (<1120), Prev/Next (<1080). Everything
fits from 980px up; below that the tool strip scrolls. Earlier tests (maximize, right-click menu,
empty state, theme, no text select) rerun and pass. A second Claude session was adding an About
screen to app/index.html at the same time; both sets of changes are intact.

### 16. About screen with the author (Claude Code, 2026-10-14)
"create about page of my work, using my linkedin profile": Help > About and a click on the logo
open an About screen inside the app (it replaced the plain Windows message box). It shows the app
(logo, version, what សាស្ត្រា means), "Made by" and open-source credits.
- The author's details were read from LinkedIn (linkedin.com/in/sunnguon). "don't show too many
  info about me", then "nah too simple": settled on work only — name, "Full-stack & DevOps
  developer · Cambodia" (title from smith89k.com), a one-line bio, skills, and "Other work" from
  the public GitHub repos (Khmer Swipe Keyboard, AI Hub Remote, Claude Code Style, Khmer Unicode
  Fonts). No employer, career history, education or town.
- Added on request: GitHub (smith89k), the site smith89k.com, and the profile photo. The GitHub
  avatar is a text logo, so the photo is the LinkedIn one (app/author.jpg, 200 px).
- "which open source used in project should be given credit": the credits list pdf.js
  (Apache-2.0), pdf-lib, JSZip, pako, Electron (MIT), IBM Plex and Noto Sans Khmer (SIL OFL 1.1),
  and note the small libraries bundled inside pdf-lib and JSZip (UPNG, tslib, lie,
  readable-stream, setimmediate).
- package.json: author "Sunnguon Taing", copyright "© 2026 Sunnguon Taing" (installer publisher).
- Checked in headless Chrome (app + web, light + dark, 1400 px and 380 px): opens scrolled to the
  top, fits the window and scrolls inside, Esc / backdrop / Close all close it, images load, no
  console errors. Built on a Mac, so Help > About and the version line in the Electron app are
  not yet tried on Windows.
- "i think remove other work to keep it short": the "Other work" project list is gone; the About
  screen now fits a 900 px window without scrolling. Rechecked in headless Chrome (app + web).
- Copyright line changed to "© 2026 smith89k" (About footer and package.json `copyright`).

### 16. Present mode (Claude Code, 2026-10-14)
"page not full for presentation, look page 2 still show on the screen" (a 16:9 slide deck in
Maximize, where the next page peeked in): added Present — one page at a time, fitted to the whole
screen on black, in real full screen (like Acrobat's Full Screen Mode / a PowerPoint slideshow).
Present button (also while maximized), F5 from the start, Shift+F5 or Ctrl+L from the current
page, View menu items, and "Present from this page" in the right-click menu (right-clicking a page
now also makes it the current page). Arrow keys/Space/click/wheel flip pages, typing a number then
Enter jumps, a small page bar appears on mouse move, Esc ends it back on that page. Logo-row
breakpoints moved up ~45px to make room for the button. Tested in Chrome and Electron (full screen
from both F5 and the View menu).
- Follow-up, "reorder: theme move to the right": the theme switch is now the last button on the
  right of the logo row (Present, Maximize, Full screen, Theme).
- Dev name "smith89k" shown next to the full name. Bio rewritten, without mentioning Khmer
  (the author's pick): "I build web apps, run my own servers and make everyday tools."
- "polish my 3 link": the three links are now cards in a row (one column on phones): an icon,
  a label and the handle under it — Website / smith89k.com (globe, accent colour), LinkedIn /
  in/sunnguon (LinkedIn mark in LinkedIn blue, `--linkedin` token per theme), GitHub / smith89k
  (GitHub mark). Hover outlines the card in the accent colour. The `ext` arrow icon is gone.

### 17. Maximize as a slideshow in the window (Claude Code, 2026-10-14)
"1. Maximize hide Present 2. Maximize should be use for present too without fullscreen, so make
arrow key work, and disable arrow key for other keep only for next slide": while maximized the
Present button is hidden, only the current page shows, fitted whole below the logo/tabs row (no
neighbour peeking in), arrows and PgUp/PgDn only change page, and the wheel moves one page per
flick. Restore brings back the previous zoom (e.g. Fit width). The normal view keeps scrolling
arrows. Tested in Chrome and Electron; F5 still starts the full-screen Present from Maximize.

### 18. Pages panel placeholder (Claude Code, 2026-10-14)
"when no pdf opened, left sidebar feel a bit empty with nothing": with no PDF open the Pages panel
shows its heading ("Pages 0"), the hint "Page thumbnails appear here when you open a PDF." and three
faint dashed page outlines; real thumbnails replace them when a PDF opens. Also drawn at startup.
- Follow-up, "make it gray same as right sidebar": the placeholders are now grey boxes styled like
  the Tools panel's disabled buttons (same fill, border, corners and 45% opacity).
- "still white": at 45% opacity the Tools-panel grey almost vanished on the panel background, so the
  placeholders are now a solid grey fill (the `--line` colour) with no dimming, visible in both themes.
- "nah, i mean the background of the left sidebar should be gray as background of right sidebar,
  consistent": the two panels were already the same off-white (measured 247,246,243 in the user's
  window); the right one only looked grey from its many grey controls. Both side panels now use the
  grey of the top and status bars, and the Tools panel's controls and the Pages placeholders are
  lighter cards on it. Checked in Chrome (light/dark) and in the running app window.

### 19. Tab row: no scrollbar, ‹ › buttons, Ctrl+Tab (Claude Code, 2026-10-15)
"1. disable scrollbar on tab 2. click to go left and right 3. control tab and control shift tab to
switch": the tabs now sit in a strip with no scrollbar; ‹ › buttons appear at its ends only when the
tabs don't fit (greyed at each end) and scroll it by most of its width; the mouse wheel over the tabs
scrolls them too; + stays visible after ›. Ctrl+Tab / Ctrl+Shift+Tab (and Ctrl+PgDn/PgUp) switch to
the next/previous tab, wrapping round, even from a text field; File > Next Tab / Previous Tab in the
desktop menu. Works in Maximize too (tabs beside the logo).
Also asked mid-way: "Maximize have to show right click panel to switch hand tool just like acrobat" —
checked in Chrome and Electron: right-click in Maximize shows the menu with Select tool / Hand tool
first, and choosing Hand tool switches to it. Tested in Chrome (23 checks) and Electron.
- Follow-up, "1. remove + button on tab bar when minimize but keep it on maximize 2. when maximize,
  logo block and right button block have top and bottom margin not = 3. keep tab separate from logo
  block and right button block": + shows only while maximized; the maximized bar lost its top-only
  padding, so the logo block (was 6.5px above / 0.5px below) and Restore/Full screen (7.5 / 1.5) are
  now centred (3.5 / 3.5 and 4.5 / 4.5); thin dividers separate the tabs from both blocks. Also fixed:
  entering Maximize could leave the active tab scrolled out of view.

### 20. Security update: Electron 33 → 44 (Claude Code, 2026-10-15)
The user pasted `npm audit` ("20 vulnerabilities (4 moderate, 15 high, 1 critical)"). Most were in
build-only tools; the ones that matter were Electron 33 (end-of-life, dozens of advisories) and
pdf.js 3.11.174 (script in a malicious font), which was already blocked by `isEvalSupported:false`
and the CSP.
- Electron 33.2.1 → 44.7.2, electron-builder 25.1.8 → 26.15.3. `overrides` pin
  `@mapbox/node-pre-gyp` 2.0.3 and `global-agent` 4.1.3 (both build-time only). Audit: 20 → 1, the
  mitigated pdf.js one; clearing it needs pdf.js 4.2+ (ES modules only), left for later.
- Breaking changes that touched the app: Electron 42 stopped downloading its binary on install (the
  existing postinstall script already does that, comment updated); Electron 43 makes dialogs start in
  Downloads and forget the last folder, so the Open dialog now remembers its folder in main.js.
- New 42-check Playwright run (script outside the project) passed on `npm start` and on the rebuilt
  packaged app, including Help > About's version line in Electron for the first time. Installer is now
  112 MB (was 82 MB), all from Electron itself; app.asar is still 2.5 MB.

### 21. pdf.js 3.11 → 6.4 (Claude Code, 2026-10-15)
"1 high severity vulnerability — can get replacement?" The last audit warning was pdf.js 3.11.174.
The user added: "mostly khmer pdf save from word file", so those were the files to protect.
- pdf.js 6.4.299 has no eval-based font path at all. It ships only ES modules: both pages now load it
  with `import()` from the existing classic script (no other code moved). The app bundles its
  support files (JBIG2/JPEG 2000 decoders, standard fonts, CJK maps; ~3.3 MB) and passes them as
  absolute URLs; the web version loads pdf.js from jsDelivr because cdnjs lacks those folders.
  CSP gained 'wasm-unsafe-eval' for the decoders. About > credits name the newly bundled parts
  (all BSD/MIT/Apache, Liberation Sans GPL-2.0 with font exception; no AGPL).
- Before/after render fingerprints: Khmer Word PDFs (three of the user's own work documents, 8
  pages each checked) are pixel-identical (one non-Word file: 3 pixels of anti-aliasing). A JBIG2
  test file that rendered blank now renders. Two synthetic JPEG 2000 test files render differently,
  same as every pdf.js since 5.0 (upstream switched to OpenJPEG).
- `npm audit`: 0. The `@mapbox/node-pre-gyp` override went away with pdf.js 3's optional canvas.
  42-check run passed on `npm start` and the rebuilt installer's app; web version checked in Chrome.

### 22. Full screen: right-click menu was invisible (Claude Code, 2026-10-15)
"full screen can not right click". The Full screen button called `#app.requestFullscreen()`. Only the
full-screen element and its children are drawn, and the right-click menu, About/confirm dialogs and
toasts are appended to <body>, so all of them opened but stayed hidden behind the page (reproduced:
`elementFromPoint` at the menu's centre hit the page canvas). Now the button puts the whole document
in full screen. Checked in Electron (dev and packaged; plus Maximize + Full screen, and Full screen →
F5 Present → Esc → right-click) and in Chrome for the web version; 42-check run still passes.
- While testing, a test launch handed its PDF to the user's open window (single-instance lock);
  test copies now run with their own `--user-data-dir`.

### 23. About: open-source list with versions (Claude Code, 2026-10-15)
"we updated package, please check list of open source in about page". The rows were right but had no
versions, so the updates didn't show. Each library now shows its version (pdf.js 6.4.299, pdf-lib
1.17.1, JSZip 3.10.1, pako 1.0.11, Electron 44.7.2; fonts have none). The note now also names
Electron's FFmpeg, where the full Chromium/Node.js licences are (LICENSES.chromium.html in the app
folder) and the installer tools (electron-builder MIT, NSIS zlib). Checked against the shipped files:
Liberation Sans in pdf.js is 1.07.4 (GPL-2.0 with font exception), JSZip is MIT/GPLv3 dual (used
under MIT), pdf-lib and JSZip both bundle pako 1.0.11. New `scripts/check-credits.js` runs on every
`npm install` and warns when About or the web page's CDN URLs lag behind node_modules.

### 24. Khmer text in the UI uses a Khmer font (Claude Code, 2026-10-15)
"khmer word in app has no font" (screenshot of tabs named ករណីបំណុល …). Only `.brand-km` asked for
Noto Sans Khmer; the UI stack (IBM Plex Sans, system-ui, Segoe UI…) has no Khmer, so Chromium fell
back to Leelawadee UI (confirmed with CDP `CSS.getPlatformFontsForNode`). Now "Noto Sans Khmer",
"Khmer UI" follow IBM Plex in `--ui` and `--mono`, and Google Fonts also loads weight 400. Checked:
tab names render in Noto Sans Khmer with stacked letters intact (zoomed ×3), offline falls back to
Khmer UI, the web version matches; 42-check run passed on `npm start` and the rebuilt installer app.

### 25. Web version removed (Claude Code, 2026-10-15)
"why have web version?" → it was the first draft (entry 2), kept in web/ when the Electron app was
made, and every change had to be made twice. "no need web version" → web/index.html deleted (still
in git history). check-credits.js now checks only app/index.html; README and CLAUDE.md updated, and
README's Node requirement raised to 22.13 (Electron 44 / pdf.js 6). app/index.html keeps its
plain-browser fallbacks (file inputs, downloads, sample PDFs); they do no harm in Electron.

### 26. Version in the window title, "(dev)" for dev runs, first release (Claude Code, 2026-10-15)
"1. add vesion on title of app 2. add (dev) on title for dev run 3. release the first version".
The title is now "name — Sastra PDF 1.0.0", and "… Sastra PDF 1.0.0 (dev)" when run from source.
main.js builds the tag from app.getVersion() and app.isPackaged and hands it to the page through
`additionalArguments` (sandboxed preload reads process.argv), so page and window titles agree with
no IPC round trip. Then v1.0.0 was released (see Status in CLAUDE.md).

### 27. Title shows "v1.0.0" (Claude Code, 2026-10-15)
"for version on title should be v.x.x.x" → the title tag is now "Sastra PDF v1.0.0" ("… (dev)" from
source). Read as the usual "v" + version, matching the git tag v1.0.0. The released v1.0.0 installer
still shows "Sastra PDF 1.0.0"; the rebuilt dist installer has the new title. Also asked: "for .exe
file is github run it?" → no: the installer was built on this PC and uploaded; GitHub only hosts it.

### 28. v1.0.1, built by GitHub Actions (Claude Code, 2026-10-15)
"ok" (to publishing the title change as v1.0.1 and letting GitHub build the installer). Version
bumped to 1.0.1; `.github/workflows/release.yml` builds the NSIS installer on windows-latest when a
vX.Y.Z tag is pushed and creates the release from the annotated tag's message, adding the
installer's SHA-256. A manual run of the workflow was used as a dry run before tagging.
- Result: the dry run (and the v1.0.1 tag's run) never started — GitHub said "recent account
  payments have failed or your spending limit needs to be increased". v1.0.1 was then built locally,
  passed the 44 checks (title "Sastra PDF v1.0.1", About "Version 1.0.1") and was uploaded by hand.
  The workflow stays for when the account's billing is sorted out.

### 29. Preparing to go open source for free code signing (Claude Code, 2026-10-15)
After Trend Micro blocked the downloaded installer ("Suspicious File", new and unsigned) and GitHub
Actions was blocked by account billing, the user asked for a free route: "go open source to get free
signing. how?" Plan: SignPath Foundation signs OSS for free (OSI licence, public repo, builds by CI
from the repo, a "Code signing policy" with roles and a privacy statement, MFA, each signing
approved by hand; the publisher shown is "SignPath Foundation"). Public repos also get free Actions.
- Licence chosen: **MIT** (LICENSE, package.json). README gained Download, Code signing policy
  (marked "applied for") and Licence sections.
- The app no longer loads Google Fonts: IBM Plex Sans/Mono and Noto Sans Khmer ship in
  app/vendor/fonts (Fontsource, Latin/Latin-ext/Khmer woff2, ~370 KB); CSP no longer allows Google.
  Checked: zero non-local requests on startup, opening a PDF and About; all fonts load from the app.
- Removed scripts/release.js (a local one-click release, never committed): no longer needed.

### 30. Right-click menu in File Explorer (Claude Code, 2026-10-15)
"add right click on selected pdf file in explorer: 1. combind those file (for more than 2 file
selected) 2. split pdf here or in folder with the file name. 3. extract pdf to image (fix jpg 300dpi
or select option, please suggest me) here or in folder with the file name." Asked also: "is work on
windows 10?" → yes (Windows 10 has only the classic menu, where the items show right away).
Decisions (asked one at a time):
- **Where**: the first (compact) Windows 11 menu, not only "Show more options". That needs package
  identity; the user chose to **try unsigned** first instead of buying a certificate.
- A spike on this PC proved it: an unsigned sparse package + a small C++ IExplorerCommand DLL showed
  "Sastra PDF (test)" in the first menu and got all 3 selected files in one call — but Windows only
  accepts it when added as admin (one UAC "Yes" at install). No / no admin → the installer uses the
  classic menu instead (under "Show more options"), the same code Windows 10 uses.
- **Combine** opens the result in Sastra PDF as one unsaved tab, files in name order (Acrobat-style);
  Save As starts in their folder. **Split** = one file per page. **Images** = fixed JPG 300 dpi (Claude's
  suggestion: opens everywhere, sharp enough to print and read small Khmer text, 5–10× smaller than PNG;
  other formats stay in the app's Export panel).
- Split/Images run in a small progress window (Cancel; one Replace / Keep both / Cancel question per
  click; problems listed); the main window doesn't open for them.
Built from a written spec and plan with tests first: C++ harness, Node unit test, Playwright jobs test,
then the user clicked through the real menu (both the package and the classic fallback).

### 31. Pictures in the Explorer menu (Claude Code, 2026-10-17)
The user asked for pictures in the right-click menu, to put scans and phone photos into a PDF. Decisions (asked one
at a time): pictures and PDFs combine together in name order; each picture page is the picture's own size (no A4
fitting); one picture → "Make PDF"; the result opens as an unsaved tab; JPG, PNG, BMP, GIF and WebP (HEIC and TIFF
were asked for, then dropped as rare). JPEG goes in without re-compression, phone-photo rotation (EXIF) is applied.
The menu package version went to 1.1.0.0, so the update asks for admin once. New logo and .pdf file icon on the same branch.
Built from a written spec and plan with tests first: C++ harness, Node unit test, Playwright (every EXIF orientation
drawn by pdf.js and compared with how Chromium shows the photo).

### 32. Red accent, Bohpum-style controls and print screen (Claude Code, 2026-10-17)
After the new logo the user said the colours didn't match it: the accent became the logo's red (#cc2229 light, a step
deeper than the logo so white button text stays readable; #ff5c61 dark). Then "use custom dropdown select and tick/radio
the same Bohpum app" (their sister app): every dropdown, tick box and round option got Bohpum's look, and keys pressed
inside an open list no longer reach the page (Delete had deleted a page while choosing). Then "printing window should be
the same bohpum app": the Print dialog became a print screen filling the window, with Publisher-style big dropdowns, a
zoomable preview and Save as PDF ("exactly what prints", chosen over sharp-text PDFs). The installer now also refreshes
Windows' icon cache so an update shows the new icons at once.

### 33. Open source, tried and undone (Claude Code, 2026-10-19)
Bohpum, the sister app, went public for SignPath's free code signing, and the user asked "please go open source like
bohpum to get code-signing". Done from a written spec and plan: GPL 3.0, About linking to the code, Bohpum's five-job
release with a SignPath step, version 1.1.3, README and setup guide for a public project. Before going public the
history was cleaned (the names of the user's work documents and the Gmail address on every commit) and force-pushed,
and the repository was made public. The same day the user changed their mind: "undo to private", then "back to before
we plan to go public". The repository is private again and every file is back to its 2026-10-18 state (undone with
new commits, so the work stays in git history). The cleaned history stays.

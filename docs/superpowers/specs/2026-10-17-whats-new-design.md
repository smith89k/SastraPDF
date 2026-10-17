# What's new window, as in AI Hub — design

Date: 2026-10-17 · Status: approved by the user in chat ("make release not popup like ai-hub" = release NOTE popup →
"Yes, What's new box"; parts: New/Improved/Fixed tags + See earlier versions, no module groups, no Print button → "ok")
Model: AI Hub packages/core/release-notes/notes.mjs (the list + `noteFor` / `earlierNotes` / `shouldShow`) and
packages/web/shared/release-notes.mjs (the window, `.notes-kind-*` tags, "See earlier versions").

## Behaviour
- The first time a version starts that this profile has never run before — an update, or a new install — the main window
  shows **What's new in 1.1.0** by itself. Closing it in any way (Close, Esc, a click outside) records the version; it does
  not come back until the next version. Same rule as AI Hub: `shouldShow = noteFor(version) && lastSeen !== version`
  (inequality, not "newer": a downgrade or a broken memory shows the notes once and then repairs itself).
- **☰ › Help › What's New** (above About) opens the same window on demand. Opening it on demand also records the version.
- Each line starts with a small tag: **New** (red, `--accent` on `--accent-soft`), **Improved** (neutral, `--fg` on
  `--chrome`), **Fixed** (green, `--ok` on a 14 % `--ok` tint), **Removed** (`--muted` on `--chrome`). Lines are listed in that
  order of kinds, in written order within a kind.
- Under the list, **See earlier versions ›** reveals every older version in the same window, each under "1.0.3 · 2026-10-16".
  Hidden when there are none.
- The window is the app's own `.modal` (as About and the questions), 560 px wide, never taller than the window: the title
  (+ release date under it) stays at the top, the list scrolls, **Close** (primary) stays at the bottom with the focus.
- It never stands in the way: the automatic showing is skipped (and NOT recorded, so the next start tries again) when any
  `.modal-bg` box is already open (a question, the close question, the print screen, About) or a Present show is running. The
  menu item does nothing while another box is open, like About.
- A version with no entry (only possible in a hand-made build): nothing opens by itself; the menu opens "What's new" with
  every known version shown open. Plain browser (no `desk`, no version): never by itself, and there is no menu.
- Text only, no HTML in the notes; everything goes through an escape (a note may hold a Khmer file name).

## Design
- **app/notes.js** — classic script like print.js, `window.SastraNotes = { NOTES, KINDS, noteFor, earlierNotes, shouldShow }`.
  `NOTES` = frozen list, newest first: `{ version:'1.1.0', date:'2026-10-17', notes:[{ kind:'new', text:'…' }, …] }`,
  kinds `new | improved | fixed | removed`. Order in the list is the only notion of "older"; nothing compares version numbers.
  `noteFor(v)` → that entry or null; `earlierNotes(v)` → the entries after it (all of them when `v` is unknown);
  `shouldShow(v, lastSeen)`. Loaded by index.html before the main script (CSP: same-origin script, no change).
- **app/index.html** — `openNotes(version, { auto })` builds the window (markup from `notesHtml(...)`), next to `openAbout`,
  same open/close/Esc/click-outside/focus-return code. Memory: localStorage `sastra-notes-seen` = the version string, read and
  written in try/catch (a blocked storage just means it may show again). Start-up: once `desk` is there,
  `desk.appVersion()` → if `shouldShow` and nothing is in the way → `openNotes(v, { auto:true })`. `desk.onMenu('whatsNew')`
  → `openNotes(v)`. CSS `.modal.notes`, `.notes-list`, `.kind-*`, `.notes-more`, `.notes-past`.
- **main.js** — Help menu: `{ label: "What's &New", click: () => send('whatsNew') }` before About.
- **scripts/check-notes.js** — runs app/notes.js in a `vm` context and stops the build (exit 1, plain message) when the newest
  entry's version is not package.json's, a version is listed twice, an entry has no date (YYYY-MM-DD) or no notes, or a note
  has an unknown kind or empty text. Run first by `npm run dist`, `npm run dist:portable` and the release workflow (a step
  before "Build the installer").
- **Release steps (CLAUDE.md)**: after `npm version X.Y.Z`, write the new entry at the top of app/notes.js (the release date
  too); the GitHub release notes can be copied from it.

## Content
Newest first. 1.0.4 was never released, so its changes are in 1.1.0. The 1.1.0 wording is a draft for the user to check.

**1.1.0 · 2026-10-17** (date updated on release day)
- New: Right-click pictures (JPG, PNG, BMP, GIF, WebP) in File Explorer → Sastra PDF. Make PDF turns one picture into a PDF. Combine joins any mix of pictures and PDFs into one PDF.
- New: A new Print screen. Choose the printer, pages, layout (Poster, Multiple, Booklet), paper, sides and colour on the left, and see every sheet on the right. Zoom in with Ctrl and the mouse wheel.
- New: Save as PDF on the Print screen saves exactly what would be printed.
- New: Make the Pages panel wider or narrower by dragging its right edge. Double-click the edge for the normal width.
- New: This What's new window. It opens once after each update. Open it again from ☰ › Help › What's New.
- Improved: A new logo, and a new icon for PDF files in File Explorer.
- Improved: The app's colour is now the logo's red, in both light and dark themes.
- Improved: Dropdowns, tick boxes and round options have the app's own look.
- Improved: The logo row is now the window's title bar and keeps the same height when maximized. The menu opens from ☰, or with Alt or F10.
- Improved: Open and Save start in the last folder you used, even after a restart.
- Improved: The progress window, Combine and Open with now come to the front instead of opening behind other programs.
- Improved: The Save button shows a floppy disk, as in other programs.
- Fixed: After an update, the right-click menu could disappear from File Explorer. The installer now checks it and sets it up again (Windows may ask for permission once).
- Fixed: After an update, Windows shows the new icons straight away.
- Removed: The Full screen button. Maximize does the same, and F11 still works.

**1.0.3 · 2026-10-16** (from the GitHub release notes)
- New: Right-click PDFs in File Explorer → Sastra PDF: Combine, Split here, Split to a folder, Images here and Images to a folder (JPG, 300 dpi).
- New: Split and Images run in a small progress window with Cancel. It asks once before replacing files that are already there, and lists any PDF it could not open.
- Improved: On Windows 11 the installer asks once for permission to put the menu in the first right-click menu. Click No, or without admin rights, and the menu is under Show more options. On Windows 10 it shows right away.
- Improved: Closing Sastra PDF with unsaved changes asks in the app's own style and lists the files. The app no longer uses Windows message boxes.
- Fixed: Uses less memory in long editing sessions.

**1.0.2 · 2026-10-15**
- New: Print (Ctrl+P): choose the printer and its Properties, copies, black and white, which pages, Fit / Actual size / Shrink / Custom scale, Poster, several pages per sheet, Booklet, both sides and paper size, with a preview of every sheet.
- New: Split can save the parts into a folder, one PDF each. Export as images saves one picture file per page.
- Improved: A new portrait icon for PDF files in File Explorer.
- Removed: ZIP files. Split and Export save separate files instead.

**1.0.1 · 2026-10-15**
- New: The window title shows the version, for example ករណីបំណុល.pdf — Sastra PDF v1.0.1.

**1.0.0 · 2026-10-15**
- New: The first release: open PDFs in tabs, combine, split, remove, rotate and reorder pages, export pages as images, and present.

## Testing (Playwright `whats-new-test.js`, source + packaged; node for check-notes)
Fresh profile → the window opens by itself, title "What's new in <package.json version>", one tag per line in kind order,
Close has the focus; Esc closes and `sastra-notes-seen` = the version; restart → it does not open; seen = "1.0.3" → it opens
again; ☰ › Help › What's New (main's menu item clicked) → it opens, nothing happens while another box is open; See earlier
versions → 1.0.3 … 1.0.0 with dates, the link hides; a long list scrolls inside the window while Close stays in view (800 × 600
window); light and dark tag colours; page shortcuts (Delete, Ctrl+O) do nothing while it is open; no console errors.
check-notes: passes on the real file; fails on a wrong newest version, a duplicate, a missing date, an unknown kind.
Earlier suites: their launch helper closes this window when it appears (fresh profiles see it once), then they pass as before.

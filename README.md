# Sastra PDF (សាស្ត្រា PDF)

A free, open-source PDF workbench for Windows in the style of Acrobat Pro, built with Electron. *Sastra*
(សាស្ត្រា) are the traditional Khmer palm-leaf manuscripts: each leaf is a page.

## Features
- Several PDFs open at once, each in its own tab
- Hand tool (H, or hold Space), zoom (Ctrl + mouse wheel), Fit page / Fit width
- Opens maximized; Maximize page area (F) and Full screen (F11)
- Page thumbnails: click to select, Ctrl/Shift-click for more, drag to reorder
- Rotate, delete, extract and insert pages, with Undo/Redo (Ctrl+Z / Ctrl+Y)
- Combine files; Split every N pages, by ranges, or one file per page, into new tabs or a folder
- Export pages as PNG or JPG at 72 / 150 / 300 dpi (several pages: one file each, in a folder)
- Print (Ctrl+P) on a full-window print screen (big dropdowns, zoomable preview, Save as PDF of exactly what
  prints): printer and its Properties, copies, grayscale,
  page ranges, odd/even, Fit / Actual size / Shrink / Custom scale, Poster, pages per sheet, Booklet,
  both sides, paper size, and a preview of every sheet
- Ctrl+S saves back to the original file; Ctrl+Shift+S is Save As
- "Open with Sastra PDF" for .pdf files in File Explorer; asks before closing with unsaved changes
- Right-click PDFs or pictures (JPG, PNG, BMP, GIF, WebP) in File Explorer → **Sastra PDF**: Make PDF from
  one picture, Combine the selected files (PDFs and pictures together, in name order), Split (one file per
  page, here or into a folder named after the PDF), Images (JPG, 300 dpi, here or into a folder).
  On Windows 11 the installer asks once for permission to put it in the first right-click menu;
  without it, the same items are under "Show more options". On Windows 10 they show right away.
- Works fully offline; files never leave the computer (only updates need the internet)
- Updates itself: a new version downloads quietly, then it asks to restart (or installs when you close it);
  ☰ › Help › Check for Updates checks by hand
- ☰ › Help › About shows the version, the author, the license (GNU GPL 3.0 or later) with a link to this source code,
  and the open-source parts inside Sastra PDF

## Download
Get the newest `Sastra-PDF-Setup-<version>.exe` from the [Releases page](https://github.com/smith89k/SastraPDF/releases)
and run it (Windows 10 and 11, 64-bit). Installed copies update themselves.

**If Windows says "Windows protected your PC":** until releases carry their free digital signature
(see [Code signing policy](#code-signing-policy)), Microsoft SmartScreen warns about the installer because it is new.
Click **More info**, then **Run anyway**. Or, before opening it: right-click the file → **Properties** → tick
**Unblock** → **OK**. If there is no *Run anyway* button, Smart App Control is on for that PC
(Windows Security → App & browser control → Smart App Control). Updates installed by the app don't show this.

## Build from source
You need **Node.js** 22.13 or newer (LTS, from https://nodejs.org — Electron 44 and pdf.js 6 need it) and **pnpm**
(`npm install -g pnpm`; the project uses pnpm, not npm).

    git clone https://github.com/smith89k/SastraPDF.git
    cd SastraPDF
    pnpm install
    pnpm start

`pnpm install` also fetches Electron and copies pdf.js, pdf-lib and the fonts into `app\vendor`. **run.bat** does the
same as `pnpm install` + `pnpm start`.

`pnpm test` runs the tests in `tests\` (`node --test`; `node --test tests\<file>` runs one).

To build an installer on your PC (`dist\Sastra-PDF-Setup-<version>.exe`, not signed), double-click **build.bat** or run:

    pnpm run dist

It checks What's new (`scripts/check-notes.js`: the newest entry in `app/notes.js` must be `package.json`'s version),
builds the File Explorer menu, then the installer. The menu needs **Visual Studio Build Tools** ("Desktop development
with C++", x64) and the **Windows 10/11 SDK**. `pnpm run dist:portable` makes a single .exe that runs without
installing. A local build has no update key: it doesn't update itself. Only the release job's installers do.

## Releasing
GitHub Actions builds each release from this repository and puts it in a Cloudflare R2 bucket behind
`https://sastra-update.smith89k.com/`, locked so that only installed copies (which carry the update key) get in, and on
the Releases page. Installed copies check when they start and every 6 hours.

1. `pnpm version 1.2.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write that version's notes at the top of `app/notes.js` (What's new) with today's date. They become the GitHub
   release notes; the release stops without them.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type the version (or `gh workflow run release.yml -f version=1.2.0`).
5. Once SignPath is set up: approve the signing request in SignPath (the run waits for it). The release then gets the
   signed installer, and updates use it too.

The one-time Cloudflare, GitHub and SignPath setup, and what each step of the job does:
[docs/updates-setup.md](docs/updates-setup.md).

## Code signing policy
Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

- **What is signed:** only the installers built by the [release workflow](.github/workflows/release.yml) on GitHub
  from this repository. Installers built on a PC are never signed.
- **Committers and reviewers:** [Sunnguon Taing](https://github.com/smith89k)
- **Approvers:** [Sunnguon Taing](https://github.com/smith89k) approves every signing request by hand.
- Changes from other people are reviewed by a committer before they are merged.
- Until SignPath Foundation accepts the project, releases are not signed (see [Download](#download)).

## Privacy
This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it, with one exception:

- **Update checks:** when it starts and every 6 hours, Sastra PDF asks `https://sastra-update.smith89k.com/` (run by
  the author on Cloudflare) whether a newer version exists, and downloads it if so. ☰ › Help › Check for Updates does
  the same by hand.

These requests carry only Sastra PDF's update key and what any web request carries (such as your IP address). Nothing
about you or your files is sent: your PDFs stay on your computer. The app has no telemetry and no online fonts. The
links in ☰ › Help › About open in your web browser only when you click them.

## License
Copyright © 2026 Sunnguon Taing.

Sastra PDF is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but **without any warranty**; without even the implied
warranty of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full text.

Parts made by others (also listed in ☰ › Help › About):

- **pdf.js** (Apache 2.0) draws the pages; inside it OpenJPEG (BSD-2), PDFium's JBIG2 decoder and Foxit fonts (BSD-3),
  qcms (MIT), Adobe character maps (BSD-3) and Liberation Sans (GPL-2.0 with font exception).
- **pdf-lib** (MIT) edits the files, with UPNG and tslib (MIT, 0BSD), and **pako** (MIT, Zlib).
- **Electron** (MIT), with Chromium, Node.js and FFmpeg; their licenses are in `LICENSES.chromium.html` in the app folder.
- **electron-updater** (MIT) for automatic updates, with the small libraries it uses (MIT, ISC, Python-2.0, Blue Oak 1.0.0).
- **IBM Plex Sans**, **IBM Plex Mono** and **Noto Sans Khmer** (SIL Open Font License 1.1), packaged by Fontsource (MIT).
- The installer is made with electron-builder (MIT) and NSIS (zlib).

## Project layout
    main.js            Window, menus, file dialogs, "Open with" handling, printing
    preload.js         Safe bridge between the page and Windows (open/save files)
    app/index.html     The app itself (UI and all PDF tools)
    app/print.js       Printing: the print screen, sheet layouts, the print run and Save as PDF
    app/pdfops.js      PDF helpers shared by the app and the Explorer-menu window
    app/images.js      Turns pictures into PDF pages (Make PDF / Combine from the Explorer menu)
    app/notes.js       What's new: every version's notes, newest first
    app/task.html/.js  The small window that runs Split / Images from the Explorer menu
    app/vendor/        pdf.js, pdf-lib and the fonts (copied automatically by pnpm install)
    explorer-menu/     The File Explorer right-click menu: C++ source (menu.cpp) and its
                       Windows 11 package manifest; built into explorer-menu/out/
    explorer-menu.js   Adds/removes that menu (run by the installer) and reads what it asked for
    updater.js         Automatic updates: when to check, what to tell the app (uses electron-updater)
    build/installer.nsh  Installer steps for the Explorer menu
    build/icon.ico     App and installer icon (made from build/logo.png)
    build/logo.png     The Sastra logo, 1024 px master
    scripts/           Run by pnpm install: fetch Electron, copy the libraries into app/vendor,
                       check the About screen's library versions; check-notes.js and build-explorer-menu.js
                       (pnpm run dist); release-notes.js, r2-prune.js, r2-put.sh and rehash-installer.js
                       (the release workflow; rehash-installer.js makes the update files again after signing)
    tests/             pnpm test: the release workflow and the signing step
    .github/workflows/release.yml  The Release button (by hand only): builds, has it signed, uploads, makes the release
    docs/updates-setup.md  The Cloudflare, GitHub and SignPath setup, and how to release
    pnpm-workspace.yaml  pnpm settings: a pinned build-tool version, which packages may run install scripts
    LICENSE            The GNU General Public License 3.0

## Troubleshooting
- **"Cannot create symbolic link" during `pnpm run dist`**: run build.bat once as Administrator,
  or turn on Windows Settings > System > For developers > Developer Mode, then build again.
- **Windows SmartScreen warns about the installer**: see [Download](#download).
- **Behind a proxy**: run `pnpm config set --global https-proxy http://host:port` (and `http-proxy`)
  before building.

# Sastra PDF (សាស្ត្រា PDF)

A Windows desktop PDF workbench in the style of Acrobat Pro, built with Electron.

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
- Works fully offline; files never leave the computer

## Download
Get the installer from [Releases](https://github.com/smith89k/SastraPDF/releases) (Windows 10 or 11,
64-bit). Each release is built by GitHub Actions from the code in this repository.

## Code signing policy
Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org). *(Applied for; until it is approved, releases are
unsigned, so Windows SmartScreen may warn: click "More info" > "Run anyway".)*

- Committers and reviewers: [Sunnguon Taing (smith89k)](https://github.com/smith89k)
- Approvers: [Sunnguon Taing (smith89k)](https://github.com/smith89k)

Only releases built by this repository's GitHub Actions workflow are signed, and each signing
request is approved by hand.

**Privacy policy:** this program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or operating it. Your PDFs
stay on your computer; the app has no telemetry, no update checks and no online fonts.

## Licence
MIT — see [LICENSE](LICENSE). The libraries and fonts it ships keep their own licences (listed on
the app's About screen).

## Requirements (to build it yourself)
- Node.js 22.13 or newer (LTS) from https://nodejs.org — Electron 44 and pdf.js 6 need it
- For the File Explorer menu (built by `npm run dist`): Visual Studio Build Tools with
  "Desktop development with C++" (x64) and the Windows 10/11 SDK

## Build the installer
Double-click **build.bat**, or in a terminal in this folder:

    npm install
    npm run dist

The installer is written to `dist\Sastra PDF Setup <version>.exe` (the version comes from package.json).
For a single .exe without installing, run `npm run dist:portable`.

## Run without installing (for development)
Double-click **run.bat**, or run `npm start`.

## Project layout
    main.js            Window, menus, file dialogs, "Open with" handling
    preload.js         Safe bridge between the page and Windows (open/save files)
    app/index.html     The app itself (UI and all PDF tools)
    app/print.js       Printing: the print screen, sheet layouts, the print run and Save as PDF
    app/pdfops.js      PDF helpers shared by the app and the Explorer-menu window
    app/images.js      Turns pictures into PDF pages (Make PDF / Combine from the Explorer menu)
    app/task.html/.js  The small window that runs Split / Images from the Explorer menu
    app/vendor/        pdf.js and pdf-lib (copied automatically by npm install)
    explorer-menu/     The File Explorer right-click menu: C++ source (menu.cpp) and its
                       Windows 11 package manifest; built into explorer-menu/out/
    explorer-menu.js   Adds/removes that menu (run by the installer) and reads what it asked for
    build/installer.nsh  Installer steps for the Explorer menu
    build/icon.ico     App and installer icon (made from build/logo.png)
    build/logo.png     The Sastra logo, 1024 px master
    scripts/           Run by npm install: fetch Electron, copy the libraries into app/vendor,
                       check the About screen's library versions; build-explorer-menu.js (npm run dist)

## Troubleshooting
- **"Cannot create symbolic link" during `npm run dist`**: run build.bat once as Administrator,
  or turn on Windows Settings > System > For developers > Developer Mode, then build again.
- **Windows SmartScreen warns about the installer**: the app is not code-signed. Click
  "More info" > "Run anyway". Signing needs a code-signing certificate.
- **Behind a proxy**: set `npm config set proxy http://host:port` and `https-proxy` before building.

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
- Works fully offline; files never leave the computer (only updates need the internet)
- Updates: when a new version is found, a small badge appears in the top bar. Click it to see the download go from
  version to version, then click Install. ☰ › Help › Check for Updates checks by hand

## Download
Sastra PDF is in the Microsoft Store (Windows 10 or 11, 64-bit), signed by Microsoft: open the Microsoft Store app and
search for **Sastra PDF**. The Store keeps it up to date. Version 1.2.0 was the last one given out as an installer;
those copies keep working but update no further — install the Store version, then uninstall the old one.
Releasing: [docs/updates-setup.md](docs/updates-setup.md).

## Signing and privacy
The Microsoft Store version is signed by Microsoft. Installers up to 1.2.0 are unsigned, so Windows SmartScreen may
warn about them: "More info" > "Run anyway".

**Privacy policy:** Sastra PDF sends nothing about you or your files anywhere. Your PDFs stay on your computer; the app
has no telemetry and no online fonts. The Store version asks the Microsoft Store, through Windows, whether a newer version exists, when it starts and every 6 hours; the app adds nothing about you or your files.
Copies installed from an installer up to 1.2.0 check https://sastra-update.smith89k.com/ for a newer version when they
start and every 6 hours; those requests carry nothing about you or your files.

## Licence
MIT — see [LICENSE](LICENSE). The libraries and fonts it ships keep their own licences (listed on
the app's About screen).

## Requirements (to build it yourself)
- Node.js 22.13 or newer (LTS) from https://nodejs.org — Electron 44 and pdf.js 6 need it
- pnpm (`npm install -g pnpm`) — the project uses pnpm, not npm
- For the File Explorer menu (built by `pnpm run dist`): Visual Studio Build Tools with
  "Desktop development with C++" (x64) and the Windows 10/11 SDK

## Build the installer
Double-click **build.bat**, or in a terminal in this folder:

    pnpm install
    pnpm run dist

The installer is written to `dist\Sastra PDF Setup <version>.exe` (the version comes from package.json).
For a single .exe without installing, run `pnpm run dist:portable`.

## Run without installing (for development)
Double-click **run.bat**, or run `pnpm start`.

## Project layout
    main.js            Window, menus, file dialogs, "Open with" handling
    preload.js         Safe bridge between the page and Windows (open/save files)
    app/index.html     The app itself (UI and all PDF tools)
    app/print.js       Printing: the print screen, sheet layouts, the print run and Save as PDF
    app/pdfops.js      PDF helpers shared by the app and the Explorer-menu window
    app/images.js      Turns pictures into PDF pages (Make PDF / Combine from the Explorer menu)
    app/task.html/.js  The small window that runs Split / Images from the Explorer menu
    app/vendor/        pdf.js and pdf-lib (copied automatically by pnpm install)
    explorer-menu/     The File Explorer right-click menu: C++ source (menu.cpp) and its
                       Windows 11 package manifest; built into explorer-menu/out/
    explorer-menu.js   Adds/removes that menu (run by the installer) and reads what it asked for
    updater.js         Automatic updates of installer copies: when to check, what to tell the app (uses electron-updater)
    store-update.js    The Store copy's update state, behind the badge and panel (app/update-panel.js)
    store-update/      The small programs the Store copy uses to talk to the Store and to reopen after an update
    build/installer.nsh  Installer steps for the Explorer menu
    build/icon.ico     App and installer icon (made from build/logo.png)
    build/logo.png     The Sastra logo, 1024 px master
    scripts/           Run by pnpm install: fetch Electron, copy the libraries into app/vendor,
                       check the About screen's library versions; build-explorer-menu.js (pnpm run dist);
                       release-notes.js (the release workflow)
    pnpm-workspace.yaml  pnpm settings: a pinned build-tool version, which packages may run install scripts

## Troubleshooting
- **"Cannot create symbolic link" during `pnpm run dist`**: run build.bat once as Administrator,
  or turn on Windows Settings > System > For developers > Developer Mode, then build again.
- **Windows SmartScreen warns about the installer**: the app is not code-signed. Click
  "More info" > "Run anyway". Signing needs a code-signing certificate.
- **Behind a proxy**: run `pnpm config set --global https-proxy http://host:port` (and `http-proxy`)
  before building.

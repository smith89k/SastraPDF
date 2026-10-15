# Sastra PDF (សាស្ត្រា PDF)

A Windows desktop PDF workbench in the style of Acrobat Pro, built with Electron.

## Features
- Several PDFs open at once, each in its own tab
- Hand tool (H, or hold Space), zoom (Ctrl + mouse wheel), Fit page / Fit width
- Opens maximized; Maximize page area (F) and Full screen (F11)
- Page thumbnails: click to select, Ctrl/Shift-click for more, drag to reorder
- Rotate, delete, extract and insert pages, with Undo/Redo (Ctrl+Z / Ctrl+Y)
- Combine files; Split every N pages, by ranges, or one file per page
- Export pages as PNG or JPG at 72 / 150 / 300 dpi
- Ctrl+S saves back to the original file; Ctrl+Shift+S is Save As
- "Open with Sastra PDF" for .pdf files in File Explorer; asks before closing with unsaved changes
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
Node.js 22.13 or newer (LTS) from https://nodejs.org — Electron 44 and pdf.js 6 need it

## Build the installer
Double-click **build.bat**, or in a terminal in this folder:

    npm install
    npm run dist

The installer is written to `dist\Sastra PDF Setup 1.0.0.exe`.
For a single .exe without installing, run `npm run dist:portable`.

## Run without installing (for development)
Double-click **run.bat**, or run `npm start`.

## Project layout
    main.js            Window, menus, file dialogs, "Open with" handling
    preload.js         Safe bridge between the page and Windows (open/save files)
    app/index.html     The app itself (UI and all PDF tools)
    app/vendor/        pdf.js, pdf-lib, JSZip (copied automatically by npm install)
    build/icon.ico     App and installer icon (made from build/logo.png)
    build/logo.png     The Sastra logo, 1024 px master
    scripts/           Run by npm install: fetch Electron, copy the libraries into app/vendor,
                       check the About screen's library versions

## Troubleshooting
- **"Cannot create symbolic link" during `npm run dist`**: run build.bat once as Administrator,
  or turn on Windows Settings > System > For developers > Developer Mode, then build again.
- **Windows SmartScreen warns about the installer**: the app is not code-signed. Click
  "More info" > "Run anyway". Signing needs a code-signing certificate.
- **Behind a proxy**: set `npm config set proxy http://host:port` and `https-proxy` before building.

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

## Requirements
Node.js LTS (20 or newer) from https://nodejs.org

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
    build/icon.ico     App and installer icon
    scripts/           Helper that copies the libraries into app/vendor
    web/index.html     Browser-only version (no install needed)

## Troubleshooting
- **"Cannot create symbolic link" during `npm run dist`**: run build.bat once as Administrator,
  or turn on Windows Settings > System > For developers > Developer Mode, then build again.
- **Windows SmartScreen warns about the installer**: the app is not code-signed. Click
  "More info" > "Run anyway". Signing needs a code-signing certificate.
- **Behind a proxy**: set `npm config set proxy http://host:port` and `https-proxy` before building.

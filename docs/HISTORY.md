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

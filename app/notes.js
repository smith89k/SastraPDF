// Sastra PDF — What's new: what changed in each version, newest first, and when the window shows by itself
// (as in AI Hub). Written by hand at release time, in plain words: what someone can now do. Text only.
// The newest entry must be package.json's version: scripts/check-notes.js stops `pnpm run dist` otherwise,
// because a release with no notes would show nothing and nobody would notice.
// Loaded by index.html before its main script; the window is openNotes there.
(() => {
'use strict';

const KINDS = Object.freeze(['new', 'improved', 'fixed', 'removed']);   // the window lists them in this order, each tagged
const N = (version, date, notes) => Object.freeze({ version, date, notes: Object.freeze(notes.map(([kind, text]) => Object.freeze({ kind, text }))) });

const NOTES = Object.freeze([
  N('1.4.0', '2026-11-05', [
    ['new', 'See new versions coming: when a new version is in the Microsoft Store, a small badge appears in the top bar. Click it to watch the download go from your version to the new one, then click Install. Sastra PDF closes to install; if it doesn\'t open again by itself, start it from the Start menu.'],
    ['improved', '☰ › Help › Check for Updates now answers inside Sastra PDF instead of opening the Store.']
  ]),
  N('1.3.0', '2026-10-20', [
    ['new', 'Make a PDF smaller: click the arrow next to Save, then Save as Reduced Size PDF… (also in ☰ › File). As in Acrobat, large pictures are brought down to 150 ppi and the file is packed tighter; the text stays exactly as it is. The copy is saved next to the original by default (Report.pdf → Report_reduced.pdf), and the open file is not changed. If the PDF can\'t get any smaller, no copy is made.'],
    ['new', 'Right-click PDFs in File Explorer → Sastra PDF → Reduce file size. Each PDF gets a smaller copy next to it (Report.pdf → Report_reduced.pdf).'],
    ['new', 'The arrow next to Save lists Save, Save As… and Save as Reduced Size PDF…, as in Acrobat.'],
    ['improved', 'Sharper text on screen: letters are drawn with Windows ClearType, as in Acrobat. Pages stay sharp when you move the window to another screen or change the display scale.'],
    ['improved', 'Sharper printing: pages go to the printer at 600 dpi (was 300). Very heavy jobs, such as hundreds of scanned pages, step down a little so the printer still gets them.'],
    ['fixed', 'Save as PDF on the Print screen and Save As for a combined file now start in the file\'s folder when it is at the top of a drive (for example E:\\Report.pdf).']
  ]),
  N('1.2.0', '2026-10-19', [
    ['new', 'Sastra PDF is now in the Microsoft Store, signed by Microsoft, so Windows no longer warns when you install it. New versions now come only from the Store. If you installed Sastra PDF from an installer: open the Microsoft Store app, search for Sastra PDF (or go to apps.microsoft.com/detail/9P768LL4RTVP), install it, then uninstall this copy in Settings › Apps. The Store version starts with fresh settings.'],
    ['new', 'Drag PDFs and pictures from File Explorer onto the Pages panel to add them where the red line shows. Pictures keep their own size. One Ctrl+Z takes it all back.'],
    ['new', 'Drag pages onto another open file\'s tab to copy them there. Hold them over the tab for half a second to open it, then drop them where you want. Inside one file, hold Ctrl while you drop to copy pages instead of moving them.'],
    ['improved', 'Insert file (Organize pages) now takes pictures too, in name order.']
  ]),
  N('1.1.2', '2026-10-18', [
    ['improved', 'The top bar is tidier: Rotate left, Rotate right and Delete are no longer repeated there. Use them from Organize pages in the Tools panel, the right-click menu, or the keys (Delete, Ctrl+Shift+L, Ctrl+Shift+R).']
  ]),
  N('1.1.1', '2026-10-17', [
    ['improved', 'Updates now come from a private address: only copies installed from a Sastra PDF installer you were given can update.']
  ]),
  N('1.1.0', '2026-10-17', [
    ['new', 'Opening a big PDF now shows a progress box with the file, the page it is on and a Cancel button. Problems stay listed in the box until you close it.'],
    ['new', 'Sastra PDF now updates itself. When a new version is ready it asks to restart, or installs it when you close the app. Check by hand from ☰ › Help › Check for Updates.'],
    ['new', 'Right-click pictures (JPG, PNG, BMP, GIF, WebP) in File Explorer → Sastra PDF. Make PDF turns one picture into a PDF. Combine joins any mix of pictures and PDFs into one PDF.'],
    ['new', 'A new Print screen. Choose the printer, pages, layout (Poster, Multiple, Booklet), paper, sides and colour on the left, and see every sheet on the right. Zoom in with Ctrl and the mouse wheel.'],
    ['new', 'Save as PDF on the Print screen saves exactly what would be printed.'],
    ['new', 'Make the Pages panel wider or narrower by dragging its right edge. Double-click the edge for the normal width.'],
    ['new', 'This What\'s new window. It opens once after each update. Open it again from ☰ › Help › What\'s New.'],
    ['improved', 'A new logo, and a new icon for PDF files in File Explorer.'],
    ['improved', 'The app\'s colour is now the logo\'s red, in both light and dark themes.'],
    ['improved', 'Dropdowns, tick boxes and round options have the app\'s own look.'],
    ['improved', 'The logo row is now the window\'s title bar and keeps the same height when maximized. The menu opens from ☰, or with Alt or F10.'],
    ['improved', 'Each section of the Tools panel folds and opens from its heading, as in Acrobat, and stays that way after a restart. Combine files is now the last section.'],
    ['improved', 'Maximize shows the page without the red selection frame.'],
    ['improved', 'Open and Save start in the last folder you used, even after a restart.'],
    ['improved', 'The progress window, Combine and Open with now come to the front instead of opening behind other programs.'],
    ['improved', 'The Save button shows a floppy disk, as in other programs.'],
    ['fixed', 'After an update, the right-click menu could disappear from File Explorer. The installer now checks it and sets it up again (Windows may ask for permission once).'],
    ['fixed', 'After an update, Windows shows the new icons straight away.'],
    ['removed', 'The Full screen button. Maximize does the same, and F11 still works.']
  ]),
  N('1.0.3', '2026-10-16', [
    ['new', 'Right-click PDFs in File Explorer → Sastra PDF: Combine, Split here, Split to a folder, Images here and Images to a folder (JPG, 300 dpi).'],
    ['new', 'Split and Images run in a small progress window with Cancel. It asks once before replacing files that are already there, and lists any PDF it could not open.'],
    ['improved', 'On Windows 11 the installer asks once for permission to put the menu in the first right-click menu. Click No, or without admin rights, and the menu is under Show more options. On Windows 10 it shows right away.'],
    ['improved', 'Closing Sastra PDF with unsaved changes asks in the app\'s own style and lists the files. The app no longer uses Windows message boxes.'],
    ['fixed', 'Uses less memory in long editing sessions.']
  ]),
  N('1.0.2', '2026-10-15', [
    ['new', 'Print (Ctrl+P): choose the printer and its Properties, copies, black and white, which pages, Fit / Actual size / Shrink / Custom scale, Poster, several pages per sheet, Booklet, both sides and paper size, with a preview of every sheet.'],
    ['new', 'Split can save the parts into a folder, one PDF each. Export as images saves one picture file per page.'],
    ['improved', 'A new portrait icon for PDF files in File Explorer.'],
    ['removed', 'ZIP files. Split and Export save separate files instead.']
  ]),
  N('1.0.1', '2026-10-15', [
    ['new', 'The window title shows the version, for example ករណីបំណុល.pdf — Sastra PDF v1.0.1.']
  ]),
  N('1.0.0', '2026-10-15', [
    ['new', 'The first release: open PDFs in tabs, combine, split, remove, rotate and reorder pages, export pages as images, and present.']
  ])
]);

// Order in the list is the only notion of "older": nothing compares version numbers.
const noteFor = v => NOTES.find(e => e.version === v) || null;
// the versions before v; all of them when v has no entry, so the menu always has something to show
const earlierNotes = v => { const i = NOTES.findIndex(e => e.version === v); return i < 0 ? NOTES.slice() : NOTES.slice(i + 1); };
// inequality, not "newer": a downgrade or a lost memory shows the notes once, then repairs itself
const shouldShow = (v, lastSeen) => !!noteFor(v) && lastSeen !== v;

window.SastraNotes = { KINDS, NOTES, noteFor, earlierNotes, shouldShow };
})();

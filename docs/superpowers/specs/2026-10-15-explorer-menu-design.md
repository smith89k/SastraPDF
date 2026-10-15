# Explorer right-click menu — design

Date: 2026-10-15 · Status: approved by the user in chat

## Goal
Right-click one or more PDFs in File Explorer → **Sastra PDF ▸** with Combine, Split and Images.
The user chose the **first (compact) Windows 11 menu**, not only "Show more options", and no paid
certificate ("try unsigned first"). Windows 10 gets the same items in its normal menu.

## What the user sees

| Item | Shown when | What it does |
|---|---|---|
| **Combine N files** | 2+ PDFs selected | Opens/focuses the main window with ONE new tab "Combined.pdf" (dirty), files joined in name order. Save As starts in the first file's folder. |
| *(separator)* | | |
| **Split here** | always | One PDF per page next to the original: `Report-1.pdf`, `Report-2.pdf`… |
| **Split to "Report\\"** | always | The same files in `<folder>\Report\` (created, or reused if it exists). 2+ PDFs: title "Split to folders", each PDF gets its own folder. |
| *(separator)* | | |
| **Images here (JPG)** | always | One JPG per page, 300 dpi, quality 0.92, white background: `Report_page-01.jpg`… |
| **Images to "Report\\" (JPG)** | always | The same images in `<folder>\Report\`. 2+ PDFs: "Images to folders (JPG)". |

- Root item "Sastra PDF" with the app icon (`Sastra PDF.exe,0`). Only `.pdf` items count; others in the
  selection are ignored; with no PDF the root is hidden. Long names in titles are cut to 32 characters + "…".
- Names match the app's own Split ("one file per page") and Export, so both give the same files.
- Name order for Combine = natural sort (`Intl.Collator(undefined, { numeric: true })`), like Explorer:
  01, 02, 10. Explorer hands items over in its own order (spike: 02, 10, 01), so sorting is required.
- Split and Images do **not** open the main window. A small **task window** (≈480×200, own taskbar
  button, app theme) shows "Splitting Report.pdf — page 12 of 40", a progress bar and Cancel. Another
  menu click while it runs is queued ("2 more waiting"). All good → "Done — 12 files saved", closes
  after 2 s. Any problem → stays open with the list and a Close button. Cancel stops after the current
  page; files already written stay.
- **Names already there**: after loading the PDFs of one click (page counts decide the names), ONE
  native question for that click: Replace / Keep both (default, " (2)" before the extension) / Cancel —
  the same wording and logic as Split/Export "Save to folder" today. Never overwrites silently.
- **Problems** (each is a line in the task window; the other PDFs still run): can't read / damaged /
  password-protected; a 1-page PDF ("only one page — nothing to split"); a FILE already named like the
  folder; can't write (read-only folder, disk full). Combine skips unreadable files and names them in a
  toast; fewer than 2 readable → error toast, no tab.
- A page that would exceed 16 384 px on a side at 300 dpi is drawn at the largest dpi that fits, noted.

## Installation (user-approved)
- **Windows 11** (build ≥ 22000): the installer adds the menu add-on package; Windows shows ONE
  "allow changes" (UAC) prompt naming Sastra PDF. Yes → first menu. No / not an admin / failure / the
  package landed on another account (over-the-shoulder admin) → **classic registration** instead
  (items under "Show more options"), no admin needed.
- **Windows 10**: classic registration (its only menu), no prompt.
- **Silent install** (`/S`): no UAC; classic registration.
- **Update**: no prompt unless the package version changed (it changes only when its manifest does).
- **Uninstall**: removes package + classic keys; no admin needed (spike: per-user Remove works).

## How it works

### 1. Menu DLL — `explorer-menu/` (new folder, C++)
- `SastraMenu.dll`, x64, static CRT (`/MT`), WRL, links only Windows libraries. CLSID
  `{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}`. Root `IExplorerCommand` with `ECF_HASSUBCOMMANDS`;
  `IEnumExplorerCommand` gives the five items (+ `ECF_ISSEPARATOR` items, dropped if Windows 11 doesn't
  draw them). `GetState` hides Combine below 2 PDFs and the root with none. Titles built from the selection.
- `Invoke`: collects `.pdf` paths (`SIGDN_FILESYSPATH`), writes a UTF-8 list file (one path per line)
  to `%TEMP%\Sastra PDF\menu-<pid>-<tick>.txt` — a list file because a command line holds only 32 767
  characters — and launches `"<install>\Sastra PDF.exe" --sastra-task=<combine|split-here|split-folder|
  images-here|images-folder> --sastra-list="<file>"`. The exe is found relative to the DLL
  (`<install>\resources\explorer-menu\` → `..\..\Sastra PDF.exe`).
- Launch through Explorer (`IShellWindows` → desktop view → `IShellDispatch2::ShellExecute`) so the app
  runs as a normal app, not inside the add-on package's identity (else taskbar icon / identity oddities);
  `CreateProcess` fallback. Test override: env `SASTRA_MENU_EXE` (only matters in the test harness).
- Never throws into Explorer: every method returns an HRESULT. Missing exe or list file failure →
  MessageBox "Sastra PDF is missing or damaged. Please reinstall it."

### 2. Package `SastraPDF.ExplorerMenu` (sparse, unsigned) — `explorer-menu/AppxManifest.xml`
- Publisher `CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1` (the OID Windows
  requires for unsigned packages), Version `1.0.0.0`, x64, `uap10:AllowExternalContent`, ExternalLocation
  = install folder, Application `Executable="Sastra PDF.exe"` (mediumIL, win32App, `AppListEntry="none"`),
  `desktop4:FileExplorerContextMenus` → `desktop5:ItemType Type=".pdf"` → the CLSID,
  `com:SurrogateServer` class `Path="resources\explorer-menu\SastraMenu.dll"`, capabilities
  runFullTrust + unvirtualizedResources. Logos (44/50/150 px) made once from `build/logo.png`.
- **Spike 2026-10-15** (Windows 11 build 26300, no Developer Mode): this shape with a test DLL showed in
  the first menu and `Invoke` got all 3 selected files in one call. Per-user `Add-AppxPackage
  -AllowUnsigned` fails (0x80073D2B "an unsigned package cannot include Executable activations"); from an
  elevated session it works; per-user `Remove-AppxPackage` works without admin.

### 3. Classic registration (Windows 10 and the fallback), HKCU only
`HKCU\Software\Classes\CLSID\{clsid}\InprocServer32` = DLL path (ThreadingModel Apartment) and
`HKCU\Software\Classes\SystemFileAssociations\.pdf\shell\SastraPDF` with `ExplorerCommandHandler` =
{clsid}, `MultiSelectModel` = Player (so it shows for more than 15 files). Same DLL, same items; it works
whichever app is the default PDF viewer. Never both: a successful package removes these keys.

### 4. Build
`scripts/build-explorer-menu.js`: vswhere → `vcvars64.bat` → `cl`/`link`; `makeappx pack /nv` → output in
`explorer-menu/out/` (gitignored). `npm run dist` runs it before electron-builder; `extraResources`
copies it to `resources/explorer-menu/` (`SastraMenu.dll`, `SastraPDF.ExplorerMenu.msix`). The build PC
needs Visual Studio Build Tools (C++ x64) + Windows 10/11 SDK (both on this PC and on GitHub's
windows-latest runners).

### 5. `explorer-menu.js` (main process, new) and installer hooks
main.js, when started with `--explorer-menu=<install|uninstall|release|add-package>`, runs this BEFORE the
single-instance lock, opens no window, uses a scratch userData folder and exits with a code.
- `install`: Windows 11 and not silent → if the package is already registered for this user with the same
  version and this install folder → done. Else start itself elevated (`Start-Process -Verb RunAs -Wait`,
  so UAC names Sastra PDF) with `add-package`, then check `Get-AppxPackage` as the user: present → delete
  classic keys; missing → classic registration. Windows 10 / silent → classic registration.
- `add-package` (elevated): remove an older version, `Add-AppxPackage -Path <msix> -ExternalLocation
  <install> -AllowUnsigned`; result logged to `%TEMP%\Sastra PDF\explorer-menu.log`.
- `uninstall`: `Remove-AppxPackage` (this user), delete classic keys, then `release`.
- `release`: stop this user's dllhost processes that loaded SastraMenu.dll; if the DLL is still locked
  (Explorer holds it in the classic case), move it to `<parent of install folder>\sastra-pdf-old\` (same
  drive, so moving a loaded DLL works) so electron-builder can replace/remove the folder (its updater
  renames every file and aborts on a busy one). That folder is emptied on the next install / app start.
- `build/installer.nsh` (`nsis.include`): `customInstall` → `ExecWait … --explorer-menu=install`
  (+ `--silent` when `${Silent}`); `customUnInstall` → `release` when `${isUpdated}`, else `uninstall`.

### 6. main.js
- `--sastra-task` / `--sastra-list` read on first launch and in `second-instance`: read the list (UTF-8,
  BOM stripped), keep existing `.pdf` paths, delete the list file.
- combine → create/focus the main window, send `combine-paths` (sorted).
- split-*/images-* → queue jobs `{ action, path }` for the task window (create it if needed;
  `app/task.html`, same preload, sandbox, CSP). App not running before → it quits when the task window
  closes (existing `window-all-closed`).
- `second-instance` with no main window (only a task window open) → create the main window for the files.
- New IPC: `make-dir` (mkdir -p, inside the PDF's folder only) and `resolve-names` (the clash question,
  parented to the calling window). The clash logic moves out of `pick-folder` into a shared
  `resolveNames(dir, names, win)` used by both.
- `save-dialog` takes an optional start folder (absolute, existing; else `lastDir`).

### 7. Renderer
- `app/pdfops.js` (classic script, `window.SastraOps`): `baseName`, `rangeLabel`, `imageName(base, i, n,
  ext)`, `renderPage(pdf, i, dpi, mime, quality)` (with the 16 384 px cap). index.html's Split and Export
  use it, so the app and the menu make identical files.
- `app/task.html` + `app/task.js`: the task window (loads pdf.js, pdf-lib, pdfops.js); per click: load
  PDFs → names → one `resolve-names` → make folder → write each file as soon as it's made (`write-file`).
- index.html: `desk.onCombinePaths` → `combinePaths(paths)` (read, merge with pdf-lib like `combine()`,
  `openBytes(…, 'Combined.pdf', { dirty:true })`, `d.saveDir` = first file's folder; waits if the app is busy); `saveAsActive`
  passes `d.saveDir`.

## Testing
- **DLL harness** (C++ test exe outside the project): loads the DLL in-process, builds selections of
  1 / 3 / mixed / Khmer-named files, checks titles, hidden Combine and root, and that `Invoke` writes the
  right list and command line (`SASTRA_MENU_EXE` → a stub exe that records its arguments).
- **Playwright** (outside the project; `npm start` and `dist\win-unpacked`; main's dialogs stubbed), app
  launched with `--sastra-task`/`--sastra-list`: split-here (10 pages → 10 one-page PDFs), split-folder
  (created; reused), 1-page PDF message, images-here (JPG size = page points × 300/72), images-folder; clash →
  Keep both / Replace / Cancel; damaged + password PDFs → error lines, others done; second task while one
  runs (second-instance) is queued; Cancel mid-way; app not running → exits after the task window closes;
  app running with an unsaved tab → main window untouched; combine 3 files → "Combined.pdf" with all
  pages in order 01, 02, 10, Save As starts in their folder; Khmer names throughout; no console errors.
  The 71 print and 22 folder-saving checks still pass.
- **Registration on this PC** (`dist\win-unpacked\Sastra PDF.exe --explorer-menu=install`, the user clicks
  Yes): the user checks the first menu and each item once; `uninstall` → gone. Fallback: install with UAC
  declined → items under "Show more options" (same path as Windows 10); uninstall → gone. Release while
  the DLL is loaded → the install folder can be removed.
- Full installer run at release time, with the user's OK (it replaces their installed copy).
- Not testable here: real Windows 10, office PCs without admin (the classic path covers both).

## Docs
CLAUDE.md (layout, how it works, build needs VS Build Tools, gotchas), README (the menu, the one UAC
question), HISTORY. No third-party code added (WRL is part of the Windows SDK), so About's credits and
check-credits.js don't change.

## Not in scope
Signing (later: it would allow adding without admin and stop the SmartScreen warning); ARM64; menu on
folders; PNG / other dpi in the menu (the app's Export has them); Khmer menu labels.

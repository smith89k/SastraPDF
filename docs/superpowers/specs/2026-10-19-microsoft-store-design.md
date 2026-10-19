# Sastra PDF in the Microsoft Store (MSIX, signed by Microsoft) — design

Date: 2026-10-19 · Status: approved by the user in three parts ("ok" to parts 1 and 2; part 3 with "check local first":
the Store package is built and tried on this PC before anything goes to Partner Center).

The user's words: "follow the microsoft store to get code-signing as bohpum app". Bohpum (E:\_httdocs\Bohpum) did this
the same day: docs/superpowers/specs/2026-10-19-microsoft-store-design.md there, store.js, build/store.config.js,
scripts/store-config.js, build/store-manifest.xml, scripts/store-check.js. This design copies it; the differences are
Sastra's (no Publisher reader; the menu has 8 file types; the installer copies update themselves today).
Then, one question at a time: Store listing for **everyone**; **one last installer update, then Store only**; each
Store package **made by the Release button and uploaded by hand** in Partner Center (as Bohpum); next version **1.2.0**.

## Why
SmartScreen warns about Sastra's installer because it has no signature, and a certificate costs money (the open-source
route for a free one was tried and undone on 2026-10-19). A Microsoft Store developer account is free for individuals
(the user already has one, from Bohpum), and an MSIX package sent to the Store is signed by Microsoft and updated by the
Store. Store users get Sastra PDF with no warning, and nobody buys a certificate.

## Decided
- **Who gets it:** everyone. The Store listing is public and searchable (not "link only", not a private audience).
- **One last installer update, then Store only:** release 1.2.0 makes both the installer (to R2, as today: installed
  copies update to it by themselves) and the Store package. Its What's new tells installer users the app is now in the
  Store. Once Microsoft has published Sastra PDF in the Store, the Release button makes only the Store package.
- **Sending a version to the Store:** the Release run puts the .msix on the (private) GitHub release; the user downloads
  it and submits it in Partner Center by hand. Microsoft reviews it (usually 1–3 days).
- **Order:** code → the test Store package on this PC (needs the user's yes to build, and one UAC prompt to install) →
  Partner Center setup → release 1.2.0 → submit → Store-only releases.

## 1. How the Store version behaves
Electron sets `process.windowsStore` when the app runs from an MSIX package. A new main-process module, `store.js` (no
Electron inside, like updater.js and explorer-menu.js), decides "this copy is the Store version" from that, and
everything below asks it. Tests switch it on with `SASTRA_STORE_TEST` (only honoured when `!app.isPackaged`).

`store.js`: `parseStoreInfo` / `readStoreInfo` (store.json → `{ identityName, publisher, publisherDisplayName, storeId }`
or null), `SIDELOAD` (the test package's identity: `SastraPDF.StoreTest`, publisher `CN=Sastra PDF,
OID.2.25.311729368913984317654407730594956997722=1` — Windows takes an unsigned package only with that OID, as the menu's
sparse package), `isStoreCopy({ windowsStore, test })`, `storePageUrl(info)` (`ms-windows-store://pdp/?ProductId=<id>`,
or `ms-windows-store://downloadsandupdates` when there is no Store ID, i.e. the test package).

- **Updates:** off. updater.js `updatesRunHere` gets `store` (false → no updater; electron-updater is never loaded).
  Help › Check for Updates: main opens the Store page (`shell.openExternal(storePageUrl)`) and answers `{ kind: 'store' }`;
  index.html `checkUpdatesCmd` then just closes "Checking for updates…". The update-ready box never shows.
- **No keys:** the Store package has no update-config.json (anyone can download a Store package and open it) and no
  app-update.yml. scripts/store-check.js stops the release if either is inside.
- **Right-click menu:** comes from the package manifest (build/store-manifest.xml): `windows.fileExplorerContextMenus`
  for `.pdf .jpg .jpeg .jfif .png .bmp .gif .webp` and `windows.comServer` (SurrogateServer) with the same
  SastraMenu.dll and CLSID {47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}, at `app\resources\explorer-menu\SastraMenu.dll`
  (menu.cpp finds `Sastra PDF.exe` two folders above the DLL: still true). No sparse package, no HKCU keys, no UAC.
  In the Store copy `--explorer-menu=…` exits 0 at once, the menu repair check answers "not needed", `cleanOld` is
  skipped. scripts/build-explorer-menu.js already checks that menu.cpp, the sparse manifest and `EXTS` agree; it also
  checks the Store manifest (same CLSID, same file types).
- **PDF files:** the manifest declares a `.pdf` file type association with the .pdf file icon, so Sastra PDF appears in
  "Open with". Windows never makes a packaged app the default by itself; people choose it.
- **Unchanged:** editing, printing, the task window, What's new, About. Settings live in the package's own data folder
  (Windows redirects AppData for packaged apps), so they start fresh and stay apart from an installer copy's.

**Proved only on this PC (the test package), with the fix decided in advance:**
- *The menu's job reaches the app.* menu.cpp writes the list file to `%TEMP%\Sastra PDF\` from the surrogate (inside the
  package) and starts the app through Explorer (`ShellLaunch`). If the app started that way doesn't run inside the
  package, or can't read the list file, menu.cpp starts it directly (`DirectLaunch`, CreateProcess: a packaged
  process's children run in its package) whenever the DLL runs inside a package other than `SastraPDF.ExplorerMenu`.
- *Both versions on one PC.* Each must open its own window. If the Store copy hands its files to a running installer
  copy (the single-instance lock is named from the userData path, which is the same string in both), the Store copy
  gets its own userData folder name, and so its own lock.

## 2. How the Release run makes the Store package
- **Build config:** `build/store.config.js` (loads store.json, or `SIDELOAD` when `SASTRA_STORE_SIDELOAD=1`) and the
  pure `scripts/store-config.js` `storeBuildConfig({ base, id, storeJson })`, from package.json `build`:
  output `dist-store`; `files` without update-config.json, plus store.json (not in the test package);
  `extraResources` only SastraMenu.dll (not the sparse .msix); `win.target` appx; `publish: null` (no app-update.yml);
  `appx`: the identity, `applicationId` SastraPDF, `displayName` Sastra PDF, `backgroundColor` transparent,
  `languages` en-US, `minVersion` 10.0.19041.0 (FileExplorerContextMenus needs 2004+), `maxVersionTested` 10.0.26100.0,
  `customManifestPath` build/store-manifest.xml, `artifactName` `Sastra-PDF-Store-${version}.msix` (electron-builder's
  ext says .appx: the same format). Not signed: Partner Center signs it. 1.2.0 becomes 1.2.0.0.
- **Logos:** `build/appx/` (StoreLogo, Square44x44Logo, Square150x150Logo, Wide310x150Logo, and the .pdf file-type
  logo), each made from the user's root originals (logo.png, "file icon.png") the same way as the other logo files:
  cut out by shape, one resample each.
- **`pnpm run dist:store`** = check-notes + build:menu + `electron-builder --win appx --publish never --config
  build/store.config.js`. With `SASTRA_STORE_SIDELOAD=1` it makes the test package for this PC.
- **Release 1.2.0 (both):** the build job builds the installer exactly as now, then the Store package, then runs
  `node scripts/store-check.js dist-store "$MSIX"` (the .msix exists; resources has SastraMenu.dll; no sparse .msix, no
  app-update.yml; app.asar has no update-config.json). The check step also stops when store.json is missing or invalid.
  The .msix goes on the GitHub release next to the installer, never to R2 (installed copies must not see it; R2 prune
  works as now). The release notes get one line: the .msix is for Partner Center, with its SHA-256.
- **What's new 1.2.0:** Sastra PDF is now in the Microsoft Store, signed by Microsoft (no more Windows warning); future
  versions come only from there (the Store link); install it from the Store, then uninstall this copy (settings start
  fresh). Store users read the same entry.
- **Store only, after Microsoft has published Sastra PDF:** release.yml becomes three jobs as Bohpum's (check: version +
  store.json, GitHub token, installs nothing; build: no token, no secret; publish: GitHub release with the .msix).
  Nothing to R2, no secrets; scripts used only for R2 go. If the Store asks for a fix before publishing, that fix
  release still makes both files. The R2 bucket, its Cloudflare lock and keys stay: 1.2.0 copies keep checking and find
  nothing newer. The installer code in the app (updater.js, menu setup, installer.nsh) stays; removing it wasn't asked.
- **Known gap:** installed copies get 1.2.0 within hours, the Store page goes live 1–3 days later; until then the link
  in What's new shows "not available". Submitting the .msix on release day keeps it short.

## 3. Testing, then the one-time setup
**Automatic** (the test suites in the session scratchpad `t\`, as now):
- unit: store.js (parse, sideload identity, isStoreCopy, page URL), `updatesRunHere` with `store`, `storeBuildConfig`
  (no update-config.json, no sparse .msix, appx target, artifact name, store.json only when not sideloaded),
  store-check.js on made-up folders, the build script's Store-manifest check, release workflow (YAML + `bash -n`; the
  Store build and check steps; the .msix on the GitHub release and not in any R2 step).
- Playwright with `SASTRA_STORE_TEST`: no updater, Check for Updates answers `store` and shows no box, no menu repair
  question. Then the usual suites (titlebar, print, menu, close, update-ui, …) since main.js changes.

**On this PC, first** ("check local first"; the user's yes before building, one UAC prompt to install): build the test
package (`SASTRA_STORE_SIDELOAD=1 pnpm run dist:store`), `Add-AppxPackage -AllowUnsigned` from an elevated PowerShell,
then: open a PDF through "Open with"; Make PDF, Combine (a mix), Split and Images from the first Windows 11 menu;
print preview; Help › Check for Updates opens the Store; the installed 1.1.2 and the Store test copy running at once
each open their own window. Remove it with `Get-AppxPackage SastraPDF.StoreTest | Remove-AppxPackage`. The two
"proved only on this PC" points above are settled here.

**Then Partner Center** (click by click in a new "Microsoft Store" section of docs/updates-setup.md):
1. Apps and games → New product → MSIX or PWA app → reserve **Sastra PDF** (if taken: choose a close name with the
   user).
2. Product management → Product identity → the four values into `store.json` (committed: not secret).
3. A privacy policy page (text in docs/store-listing.md: the Store version sends nothing anywhere; files stay on the PC),
   put on smith89k.com by the user, e.g. https://smith89k.com/sastra-pdf/privacy.
4. First submission: Free, all markets, category Productivity, the age-rating questionnaire, the listing (description,
   features, keywords from docs/store-listing.md), screenshots (Claude makes them from the app with a made-up PDF, never
   the user's documents), the `runFullTrust` reason and notes for certification (docs/store-listing.md).
5. Before the first upload: the Windows App Certification Kit (Windows SDK) on the real .msix.

Docs to update with the work: docs/updates-setup.md, docs/store-listing.md (new), README (download + privacy),
CLAUDE.md, docs/HISTORY.md.

## What could still go wrong
- The name "Sastra PDF" is taken in the Store.
- Certification asks about `runFullTrust` or the right-click menu: answer in Notes for certification and resubmit.

## Not doing
- Sending to the Store automatically (needs Microsoft Entra ID setup; the user chose to upload by hand, as Bohpum).
- A private or link-only Store listing.
- Signing the installer, or moving installer copies' settings to the Store copy.
- Removing the installer/update code from the app.

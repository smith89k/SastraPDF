# Update panel for the Microsoft Store copy — design

**Date:** 2026-11-05
**Status:** waiting for the user's read of this document

## Why

The user asked for an update panel "like AI Hub": download progress, then click Install, shown as a panel going from
version to version. AI Hub's panel is the model (`C:\_httdocs\ai-hub`: `packages/web/shared/update-window.mjs`,
`docs/superpowers/specs/2026-11-01-update-window-design.md`, styles at `.update-*` in `packages/web/shared/theme.css`).

Today the Store copy has nothing like it. The Store updates it quietly, and Help › Check for Updates only opens Sastra
PDF's page in the Store app (`main.js` `check-updates`). People learn about a new version only from What's new, after it
is installed.

## Goals — the user's decisions

1. **Store version only** (the user: "note only store version"). Copies from the old installer keep their current
   "ready to install" box and `updater.js` behaviour, unchanged.
2. **A small badge in the logo row when a new version is found, like AI Hub's**: `↓ Update 45%` while downloading,
   `Update ready` when done. No update, or nothing known: no badge at all.
3. **Clicking the badge opens the panel. It never opens by itself.**
4. **The panel shows the download progress, then an Install button**, with "This version → New version" in large type
   (old one greyed), as in AI Hub.
5. **After installing, the app should come back without the person hunting for it.** The user asked for an Open button;
   a button inside the app can't work, because the app is closed to install. Agreed approach: ask Windows to reopen the
   app, and warn in the panel in case it doesn't (see "Reopening").

## Non-goals

- Nothing changes for installer copies, the R2 update address or the installer release path (there is none now).
- No "What's new" list inside the panel. The Store gives the app no notes for a version it doesn't have yet, and fetching
  them from a server of ours would break the privacy promise. The What's new window after the update stays as it is.
- No Cancel of a download (as AI Hub: Hide only).
- No restoring of the open tabs after the update. The app comes back empty, as it does after an installer update today.
- Bohpum is not part of this. It may follow later using the same approach, so keep the helper free of Sastra-only logic.
- The Windows notification with a click-to-open is **not** built now. It is a follow-up only if the real test shows
  that reopening does not work.

## Anti-goals (a failure even if it works)

- Anything opening over the person's work by itself.
- The app closing without the person pressing Install (the Store's own background update is outside our control).
- Unsaved changes lost: the existing unsaved question must come first, and a running right-click job must block Install.
- A badge that says `Update ready` for a download that did not finish.
- The badge or panel showing in an installer copy, or a plain browser.
- A network request of our own. The only update traffic is Windows talking to the Microsoft Store.

## How the Store side works (from Microsoft's documentation, not yet tried here)

`Windows.Services.Store.StoreContext`
([guide](https://learn.microsoft.com/en-us/windows/uwp/packaging/self-install-package-updates)):

- `GetAppAndOptionalStorePackageUpdatesAsync`: are there updates.
- `CanSilentlyDownloadStorePackageUpdates`: true only when the Store's "Update apps automatically" is on and the network
  is not metered.
- `TrySilentDownloadStorePackageUpdatesAsync`: download with no Windows box, with progress.
- `RequestDownloadStorePackageUpdatesAsync`: download after Windows' own permission box, with progress. A desktop app must
  give the Store object its window handle first (`IInitializeWithWindow`).
- `TrySilentDownloadAndInstallStorePackageUpdatesAsync` / `RequestDownloadAndInstallStorePackageUpdatesAsync`: after a
  download these only install. The running app is closed.
- Progress gives `PackageBytesDownloaded`, `PackageDownloadSizeInBytes` and `PackageDownloadProgress`. In a combined
  download-and-install call the fraction runs 0–0.8 for the download and 0.8–1 for the install.

The SDK on this PC has the headers (`10.0.26100.0\cppwinrt\winrt\windows.services.store.h`). No restricted capability is
documented for these calls, so the manifest should not need to change.

## The parts

**A small helper program, Store package only.** Electron can't call these Windows features directly. Build a small C++/WinRT
console program (MSVC, `/MT`, as `SastraMenu.dll`), shipped inside the Store package under `resources`, never in the
installer build. main.js starts it and reads one JSON line per event from its output. It runs inside the package, so it
has the package's identity (to be confirmed first, see "How to check"). It holds no Sastra-only logic.

**Update state in main.js, Store copy only.** One state, sent to the page and answerable on request. First check 10 s
after start, then every 6 hours (the numbers `updater.js` uses). A right-click job alone never checks, as today. Once a
download finished, checks stop until the app closes. Problems go only to `%TEMP%\Sastra PDF\update.log`, as today.

**Badge in the logo row.** It appears only while there is something to say, so it must fit without pushing the row's
existing buttons out: re-measure the row's narrowing steps (see "Layout" in `CLAUDE.md`). Shown in the normal view and
Maximized, not in Present. Not shown when `STORE` is false.

**The panel.** The app's own `.modal` look, in the app's red, light and dark themes; about 460 px wide. It follows the
same "one box at a time" rules as the other boxes (`inTurn` / `whenFree` where it applies). Esc closes it (as Hide or
Later), never stopping the download. It can stay open while the bar moves; only the bar and its words change.

| Stage | Title | Body | Buttons |
|---|---|---|---|
| checking | Checking for updates… | spinner | Close |
| current | You have the latest version | Version X is the newest one. | OK |
| failed | Couldn't check for updates | Check the internet connection and try again later. | Open in Store · OK |
| available | Update available | This version → New version; "Windows will ask before downloading." | Later · Download |
| downloading | Update available | This version → New version; bar; "58 of 128 MB", "about 1 minute left"; "You can keep working." | Hide |
| ready | Update ready | This version → New version; full bar, "Downloaded"; "Sastra PDF will close to install X. If it doesn't open again, start it from the Start menu."; hint "Later: the Store installs it in its own time." | Later · Install |
| installing | Installing… | "Sastra PDF will close in a moment." | none |
| install failed | The update couldn't be installed | Try again later, or update from the Store. | Open in Store · OK |

`available` happens when `CanSilentlyDownloadStorePackageUpdates` is false; the badge then reads `Update available`.
Download passes the window handle to the helper, and Windows shows its own permission box.

The permission path (no quiet download allowed), settled in the builder check:

- No in Windows' download box: back to `available`, badge kept, nothing said.
- A download that fails: with the panel open, a `download failed` stage ("The download didn't finish", "Try again later,
  or update from the Store.", Open in Store · OK); the badge goes away and the next check tries again.
- `ready` adds "Windows may ask first." to its sentence, since Install uses the asking call and passes the window handle.
- No in Windows' install box: back to `ready`, not `install failed`.
- The Later hint on this path reads "Later: it stays ready. Click the badge when you want to install.", because
  "the Store installs it in its own time" may be untrue when automatic updates are off.

**Help › Check for Updates** opens this panel in `checking`, in the Store copy. Open in Store keeps today's route
(`store.storePageUrl`), so a helper or Store failure never leaves the person stuck.

**Install.** Same order as `restartForUpdate` today: `askUnsaved` first, a running task window blocks with the same kind of
message, then set `allowClose`, ask Windows to reopen, start the install. If the install doesn't start or fails,
`allowClose` goes back to false, so a later X still asks about unsaved changes.

**Reopening.** Microsoft documents `RegisterApplicationRestart` for desktop apps updated by the package system
([page](https://learn.microsoft.com/en-us/windows/msix/non-store-developer-updates), written for non-Store updates; a
[forum answer](https://learn.microsoft.com/en-za/answers/questions/5643670/update-app-from-code) says the same for Store
updates, not official). It works per process, so the builder must find what works here: a small native add-on so
`Sastra PDF.exe` registers itself, or the helper registering and then starting the app. The panel's warning covers the
case where it doesn't work.

**New version number.** Read it from the update's package (`StorePackageUpdate.Package.Id.Version`). Microsoft doesn't
clearly say this is the new version and not the installed one. If it isn't, the panel shows "New version" with no number,
and the sentences drop X. The state must allow an unknown version from the start.

**Time left** is worked out from bytes over time in main.js or the page; no speed yet says nothing.

**A failed download:** the badge goes away and the next check tries again. Check for Updates shows `failed`.

**Privacy wording must change.** The README, `docs/store-listing.md` and the Partner Center text say the Store version
makes no internet requests of its own. New sentence: "The Store version asks the Microsoft Store, through Windows, whether
a newer version exists, when it starts and every 6 hours; the app adds nothing about you or your files." Also update the
listing's "The app makes no network requests." lines. Partner Center's text has to be changed by hand in the next
submission.

## How to check

1. **First, before building the panel:** a short trial in the sideloaded test package (`SASTRA_STORE_SIDELOAD=1 pnpm run
   dist:store`, `Add-AppxPackage -AllowUnsigned`) showing the helper runs inside the package and gets an answer from the
   Store object. To pass, the helper must report the package's own name (proof it has the identity) and "no updates" or an
   error from the Store is then fine: a sideloaded copy isn't Store-licensed, and that case must end in `current` or
   `failed`, not a crash. If the helper has no identity, stop and tell the user: the helper's output is what everything
   else is built on.
2. **Pure parts under `node --test`:** state changes, badge words, time-left words, parsing the helper's lines (including
   broken ones), the helper never started when `STORE` is false.
3. **The panel with pretend updates:** a fake helper driven with `SASTRA_STORE_TEST=1`, under Playwright, for every stage,
   both themes, the narrow-window row, unsaved question, task-window block, install failing, nothing opening by itself, and
   no badge in a non-Store run.
4. **Store package checks:** `scripts/store-check.js` also confirms the helper is inside; the installer build confirms it
   isn't. Microsoft's checker (appcert) still passes.
5. **The real test needs a Store-installed copy with this code, then a newer release**, so it comes on the second release
   after this one. Partner Center's package flights could limit both to the user's own account, so real customers don't
   carry the first attempt; that's for the user to decide at release time. To confirm then: silent path, the permission
   path, the version number, reopening.

## Calls made in writing this up (not asked of the user)

- Start with Sastra PDF; Bohpum later.
- The `available` stage and its Download button when Windows needs permission.
- Download starts by itself when Windows allows it (as AI Hub).
- Failed and install-failed stages offer Open in Store.
- Checks run at 10 s and every 6 hours.
- Badge shows in Maximized too, not in Present.
- No Cancel, no tab restoring.

## Left to the builder

- The helper's command line and JSON format, and where its build step lives.
- Whether the panel code goes in `app/index.html` or a new file such as `app/update-panel.js`.
- How `RegisterApplicationRestart` gets called, within the requirement above.
- Exact badge position in the row and which steps move when re-measuring.
- Keeping the helper running through a download or restarting it per step.

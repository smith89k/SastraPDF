# Store update panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Microsoft Store copy only, a badge in the logo row and an update panel (This version → New version, download bar, Install), driven by the Store through a small helper program.

**Architecture:** `store-update/update.cpp` (a console program, JSON lines) is the only code that talks to the Store. `store-update.js` (no Electron inside, as `updater.js`) holds the update state and starts the helper. `app/update-panel.js` draws the badge and panel from that state. `store-update/restart.cpp` (`SastraRestart.node`) asks Windows to reopen the app.

**Tech Stack:** C++/WinRT (MSVC, `/std:c++20 /MT`), Electron 44 main + preload, classic-script page code, `node --test`, playwright-core.

**Spec:** `docs/superpowers/specs/2026-11-05-store-update-panel-design.md`

## Global Constraints

- Store copy only: when `STORE` is false nothing new runs, shows or ships in the installer's app behaviour.
- The panel never opens by itself. The app never closes without Install being pressed.
- No network request of our own; only Windows talking to the Store.
- Words and stages exactly as in the spec's table and permission-path list.
- Tests live outside the project (this session's scratchpad `t\`), as every suite here does.
- No push, no release, no version bump, no What's new entry: those come at release time.

## Review Focus

- Helper exits with no final line, or prints broken lines → `failed`, never a stuck bar or a stuck "Installing…". Test in Task 2.
- Install reports completed but the app is still alive → after 60 s `install failed`, and a later X asks about unsaved changes again. Test in Tasks 2 and 3.
- The Store reports the installed version, or `1.4.0.0`, as the "new" one → "New version" with no number / `1.4.0`. Test in Task 2.
- Esc with the unsaved or task question over the panel closes only the question. Test in Task 4.
- Narrow window with the badge showing: the row doesn't overflow or slide under the caption buttons. Test in Task 4.

---

### Task 1: Helper build and packaging

**Files:** Create `store-update/update.cpp`, `store-update/restart.cpp` (done in the trial). Modify `scripts/build-explorer-menu.js`, `scripts/store-config.js`, `scripts/store-check.js`, `package.json` (`build.files`), `.gitignore`. Test: `t\unit\store-config.test.js`.

**Produces:** `store-update/out/SastraStoreUpdate.exe`, `store-update/out/SastraRestart.node`, shipped by the Store config only at `resources/store-update/`.

- [x] Trial: helper inside the real installed Store packages reports the package name and a Store answer (`Invoke-CommandInDesktopPackage`).
- [ ] Failing tests: Store config has a `store-update` extraResources entry with both files, the base config doesn't; `storeProblems` names a missing helper and a missing restart module.
- [ ] Implement; `build-explorer-menu.js` also builds both files (same MSVC, already run by `dist`, `dist:store` and the release job); `store-update.js` added to `build.files`; `store-update/out/` ignored.
- [ ] Run `pnpm run build:menu` and the tests. Commit.

### Task 2: `store-update.js`

**Files:** Create `store-update.js`. Test: `t\unit\store-update.test.js`.

**Produces:**
- `parseLine(text)` → object or null
- `nextVersion(current, reported)` → `'1.4.0'` or null (null unless greater; a fourth part of 0 dropped)
- `createStoreUpdater({ run, current, send, log, hwnd, taskOpen, registerRestart, timers, now })` → `{ start(), state(), checkNow(), download(), install(), stop() }`
- `run(args, onEvent)` → `{ done: Promise<void>, kill() }`
- state: `{ stage: 'none'|'available'|'downloading'|'ready', current, next, silent, percent, transferred, total, bytesPerSecond, failed }`
- `checkNow()` → `{ kind: 'current'|'update'|'failed' }`; `install()` → `{ ok: true }` or `{ ok: false, reason: 'none'|'task'|'cancelled'|'failed' }`

- [ ] Failing tests: first check at 10 s and every 6 h, no checks while downloading or ready; silent update downloads by itself; not silent → `available`; progress → percent, bytes, speed; completed → `ready`; No in Windows' box → `available`; failed download → `none` with `failed: true`; helper dying silently or broken lines → failed; check timeout 60 s; `install` blocked by no download / task; restart asked before the install starts; install cancelled → `ready` kept; completed and still alive after 60 s → `failed`; `stop` kills check and download, not install.
- [ ] Implement. Run. Commit.

### Task 3: main.js and preload

**Files:** Modify `main.js`, `preload.js`. Test: `t\store-panel-test.js` (with Task 4), fake helper `t\fake-helper.js`.

**Consumes:** Task 2. **Produces:** `desk.storeUpdate(action)` with `'state'` (null when not Store) `'check'`, `'download'`, `'install'`, `'open-store'`; `desk.onStoreUpdate(fn)`.

- [ ] Wire: real path `resources/store-update/SastraStoreUpdate.exe`; from source only, `SASTRA_STORE_HELPER=<js>` runs it with `ELECTRON_RUN_AS_NODE=1`. `allowClose` true around install, false again on `{ ok: false }`. `--hwnd=` from `win.getNativeWindowHandle()`. Restart module loaded with `process.dlopen` only in the packaged Store copy. `stop()` on `will-quit`. A right-click job alone never starts it. `open-store` = today's `storePageUrl` route.
- [ ] Commit with Task 4.

### Task 4: Badge and panel

**Files:** Create `app/update-panel.js`. Modify `app/index.html`. Test: `t\store-panel-test.js`.

**Consumes:** Task 3. **Produces:** `window.SastraUpdatePanel` = `{ init, active, check, badgeText, sizeText, timeLeftText }`.

- [ ] Failing Playwright tests against the fake helper: badge words; nothing opens by itself; every stage's words and buttons; "1.3.0 → 1.4.0", unknown version; bar moves without rebuilding the panel; Hide/Later/Esc/click outside; Check for Updates; permission path; unsaved question first; task block; install failure; Open in Store; Maximized shows the badge; light and dark; narrow widths; no badge with `SASTRA_STORE_TEST` unset.
- [ ] Implement. `#bUpdate` before `#bPresent`, fixed 112 px; with `#app.has-update` each narrowing step moves up 116 px; `#app.focus` keeps it.
- [ ] Run. Commit.

### Task 5: Docs, real package, older suites

**Files:** Modify `README.md`, `docs/store-listing.md`, `docs/updates-setup.md`, `CLAUDE.md`.

- [ ] Privacy wording per the spec.
- [ ] Older suites still pass: store wiring, close, titlebar, controls.
- [ ] `pnpm run dist:store` with the real identity (no install): `store-check` passes, both files inside.
- [ ] In the real Store copy's package context: run the built helper's `check` and load the restart module, then read the restart registration back.
- [ ] Commit. Stop before push and release.

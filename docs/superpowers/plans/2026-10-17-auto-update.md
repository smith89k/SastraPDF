# Release to R2 and auto update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions builds the installer and puts it in a public Cloudflare R2 bucket at `https://sastra-update.smith89k.com/`; installed copies update themselves from there, asking in the app's own box.

**Architecture:** A new plain-Node module `updater.js` (no Electron inside, like explorer-menu.js) holds the rules and wraps electron-updater's `autoUpdater`, which main.js injects. main.js exposes three IPC calls and one event; app/index.html shows every box with the existing `askChoice`. The release workflow becomes `workflow_dispatch` with a version input, uploads with the AWS CLI to R2, and prunes old installers with a small tested script.

**Tech Stack:** Electron 44.7.2, electron-builder 26.15.3, electron-updater 6.8.9 (generic provider), pnpm 12.4.1, Node 24 on CI, GitHub Actions windows-latest, AWS CLI → R2 S3 API, node:test, playwright-core `_electron`.

**Spec:** docs/superpowers/specs/2026-10-17-auto-update-design.md

## Global Constraints

- Update address, written once in package.json `build.publish.url`: `https://sastra-update.smith89k.com/` — must never change after the first release.
- Installer name `Sastra-PDF-Setup-${version}.exe` (nsis `artifactName`); fixed download copy `Sastra-PDF-Setup.exe`.
- `electron-updater` pinned exactly to `6.8.9`, in `dependencies` (the app's first runtime dependency).
- First check 10 s after start (`FIRST_CHECK_MS = 10000`), then every 6 hours (`CHECK_EVERY_MS = 21600000`).
- Updates run only when `app.isPackaged`, `process.platform === 'win32'` and not portable (`process.env.PORTABLE_EXECUTABLE_DIR` unset).
- No Windows message boxes: every box is `askChoice` / `askConfirm` (or `.modal.ask` markup). Never over another `.modal-bg` or a Present show (`show.el`).
- Restart: `quitAndInstall(true, true)` only AFTER the page confirmed unsaved changes; main sets `allowClose = true` first.
- R2 upload order: installer + blockmap → `Sastra-PDF-Setup.exe` → `latest.yml` last. `latest.yml` and `Sastra-PDF-Setup.exe` get `Cache-Control: no-cache`. `.blockmap` files are never deleted.
- GitHub secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Copy (exact): ready box `Sastra PDF ${v} is ready to install.` / `Restart now to use it, or it installs the next time you close Sastra PDF.` / buttons `Later`, `Restart now`. Repair box `The right-click menu needs to be set up again.` / `Windows will ask for permission once. Without it, Sastra PDF's items stay under "Show more options".` / `Not now`, `Set up`.
- Tests live OUTSIDE the project (project rule), in `T = C:\Users\taing\AppData\Local\Temp\claude\c---httdocs-SastraPDF\59bf0bdb-0c3e-43b2-b587-2ac1889029e7\scratchpad\t`.
- Every launch of electron/the app from a Claude shell: `unset ELECTRON_RUN_AS_NODE` (bash) first; test launches use their own `--user-data-dir`.
- Work on main only; commit after each task; never push or release without asking the user.

## Review Focus

1. **Restart now with unsaved changes, then Cancel** → the app keeps running with the work and the installer was never started. Pinned in Task 5 (`install-update` never called) and Task 8 (scenario 2).
2. **The update arrives while another box or Present is open** → it waits and shows once that closes, never two boxes stacked. Pinned in Task 5 (About open, then ready).
3. **Offline / address not set up / broken `latest.yml`** → no box, no toast; Check for Updates says "Couldn't check…". Pinned in Task 1 (rejected check → failed) and Task 4 (packaged app before R2 exists → `failed`).
4. **A release run that fails half-way** → older installers stay, `latest.yml` never points at a missing file. Pinned in Task 7 (`pruneList` throws when the new installer isn't listed; upload order in the workflow).
5. **Restart now while a right-click job runs, or the update finishing with the main window closed** → no crash, the job isn't killed. Pinned in Task 1 (`installBlock`; a throwing `send` is logged and the download kept).

---

### Task 1: `updater.js` — the rules and the electron-updater wrapper

**Files:**
- Create: `updater.js` (project root, CommonJS, no `require('electron')` or `require('electron-updater')` inside)
- Test: `$T\unit\updater.test.js`

**Interfaces:**
- Produces:
  - `FIRST_CHECK_MS = 10000`, `CHECK_EVERY_MS = 21600000`
  - `updatesRunHere({ packaged, platform, portable }) → boolean`
  - `checkAnswer({ downloaded, result, error, current }) → { kind: 'ready'|'downloading'|'current'|'failed', version? }`
  - `installBlock({ downloaded, taskOpen }) → null | 'none' | 'task'`
  - `logTo(file) → (msg: string) => void` (appends `ISO-time msg\r\n`, never throws)
  - `createUpdater({ updater, current, send, log, timers = { setTimeout, setInterval } }) → { checkNow(): Promise<answer>, install(): void, downloaded(): string|null }`

- [ ] **Step 1: Write the failing tests** in `$T\unit\updater.test.js`

```js
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const U = require('C:/_httdocs/SastraPDF/updater.js');

function fakeUpdater(check) {
  const u = new EventEmitter(); u.calls = 0; u.installed = null;
  u.checkForUpdates = () => { u.calls++; return check(); };
  u.quitAndInstall = (s, r) => { u.installed = [s, r]; };
  return u;
}
const fakeTimers = () => { const t = { timeouts: [], intervals: [] };
  t.setTimeout = (fn, ms) => t.timeouts.push([fn, ms]); t.setInterval = (fn, ms) => t.intervals.push([fn, ms]); return t; };

test('updatesRunHere: installed Windows app only', () => {
  assert.equal(U.updatesRunHere({ packaged: true, platform: 'win32', portable: false }), true);
  assert.equal(U.updatesRunHere({ packaged: false, platform: 'win32', portable: false }), false);
  assert.equal(U.updatesRunHere({ packaged: true, platform: 'win32', portable: true }), false);
  assert.equal(U.updatesRunHere({ packaged: true, platform: 'darwin', portable: false }), false);
});
test('checkAnswer', () => {
  assert.deepEqual(U.checkAnswer({ downloaded: '1.2.0', current: '1.1.0' }), { kind: 'ready', version: '1.2.0' });
  assert.deepEqual(U.checkAnswer({ error: new Error('offline'), current: '1.1.0' }), { kind: 'failed' });
  assert.deepEqual(U.checkAnswer({ result: null, current: '1.1.0' }), { kind: 'failed' });
  assert.deepEqual(U.checkAnswer({ result: { isUpdateAvailable: true, updateInfo: { version: '1.2.0' } }, current: '1.1.0' }), { kind: 'downloading', version: '1.2.0' });
  assert.deepEqual(U.checkAnswer({ result: { isUpdateAvailable: false, updateInfo: { version: '1.1.0' } }, current: '1.1.0' }), { kind: 'current', version: '1.1.0' });
});
test('installBlock', () => {
  assert.equal(U.installBlock({ downloaded: null, taskOpen: false }), 'none');
  assert.equal(U.installBlock({ downloaded: '1.2.0', taskOpen: true }), 'task');
  assert.equal(U.installBlock({ downloaded: '1.2.0', taskOpen: false }), null);
});
test('createUpdater: settings and schedule', async () => {
  const u = fakeUpdater(async () => ({ isUpdateAvailable: false, updateInfo: { version: '1.1.0' } })), t = fakeTimers();
  U.createUpdater({ updater: u, current: '1.1.0', send() {}, log() {}, timers: t });
  assert.equal(u.autoDownload, true); assert.equal(u.autoInstallOnAppQuit, true); assert.equal(typeof u.logger.info, 'function');
  assert.deepEqual(t.timeouts.map(x => x[1]), [10000]); assert.deepEqual(t.intervals.map(x => x[1]), [21600000]);
  t.timeouts[0][0](); t.intervals[0][0](); assert.equal(u.calls, 2);
});
test('createUpdater: a failing scheduled check only logs', async () => {
  const logs = [], u = fakeUpdater(() => Promise.reject(new Error('offline'))), t = fakeTimers();
  U.createUpdater({ updater: u, current: '1.1.0', send() { throw new Error('no box'); }, log: m => logs.push(m), timers: t });
  t.timeouts[0][0](); await new Promise(r => setImmediate(r));
  u.emit('error', new Error('broken yml'));
  assert.ok(logs.some(m => /offline/.test(m))); assert.ok(logs.some(m => /broken yml/.test(m)));
});
test('createUpdater: a send that throws (window gone) does not break the download', () => {
  const logs = [], u = fakeUpdater(async () => null);
  const up = U.createUpdater({ updater: u, current: '1.1.0', send() { throw new Error('window gone'); }, log: m => logs.push(m), timers: fakeTimers() });
  assert.doesNotThrow(() => u.emit('update-downloaded', { version: '1.2.0' }));
  assert.equal(up.downloaded(), '1.2.0'); assert.ok(logs.some(m => /window gone/.test(m)));
});
test('createUpdater: downloaded → update-ready once per version; checkNow answers ready; install', async () => {
  const sent = [], u = fakeUpdater(async () => { throw new Error('should not check'); });
  const up = U.createUpdater({ updater: u, current: '1.1.0', send: (...a) => sent.push(a), log() {}, timers: fakeTimers() });
  u.emit('update-downloaded', { version: '1.2.0' }); u.emit('update-downloaded', { version: '1.2.0' });
  assert.deepEqual(sent, [['update-ready', '1.2.0']]); assert.equal(up.downloaded(), '1.2.0');
  assert.deepEqual(await up.checkNow(), { kind: 'ready', version: '1.2.0' }); assert.equal(u.calls, 0);
  up.install(); assert.deepEqual(u.installed, [true, true]);
});
test('createUpdater: checkNow when the check fails', async () => {
  const up = U.createUpdater({ updater: fakeUpdater(() => Promise.reject(new Error('x'))), current: '1.1.0', send() {}, log() {}, timers: fakeTimers() });
  assert.deepEqual(await up.checkNow(), { kind: 'failed' });
});
```

- [ ] **Step 2: Run to see it fail** — `node --test "$T/unit/updater.test.js"` → FAIL, `Cannot find module 'C:/_httdocs/SastraPDF/updater.js'`.
- [ ] **Step 3: Write `updater.js`** with the interfaces above. `createUpdater` sets `autoDownload`, `autoInstallOnAppQuit`, `logger = { info: log, warn: log, error: log, debug() {} }` (messages stringified), registers `update-downloaded` and `error`, schedules `check = () => updater.checkForUpdates().catch(e => log('check: ' + e.message))` with `timers.setTimeout(check, FIRST_CHECK_MS)` and `timers.setInterval(check, CHECK_EVERY_MS)`. `send` errors are caught and logged (a closed window must not break the updater). Header comment in the style of explorer-menu.js.
- [ ] **Step 4: Run** — same command → all 8 tests PASS.
- [ ] **Step 5: Commit** — `git add updater.js && git commit -m "feat: updater.js — update rules and the electron-updater wrapper"`

---

### Task 2: Right-click menu repair rule

**Files:**
- Modify: `explorer-menu.js:76` (`FIELDS`) and exports at the bottom
- Test: `$T\unit\menu-repair.test.js`

**Interfaces:**
- Produces: `repairNeeded({ build, msixExists, state, version }) → boolean`; state field `asked` (registry value `Asked`), written with `writeState({ asked: version })`.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('C:/_httdocs/SastraPDF/explorer-menu.js');
test('repairNeeded', () => {
  const b = { build: 26100, msixExists: true, state: { mode: 'classic', declined: '' }, version: '1.2.0' };
  assert.equal(M.repairNeeded(b), true);
  assert.equal(M.repairNeeded({ ...b, build: 19045 }), false);                                   // Windows 10
  assert.equal(M.repairNeeded({ ...b, msixExists: false }), false);
  assert.equal(M.repairNeeded({ ...b, state: { mode: 'package' } }), false);
  assert.equal(M.repairNeeded({ ...b, state: { mode: 'classic', declined: '1' } }), false);      // said No to Windows
  assert.equal(M.repairNeeded({ ...b, state: { mode: 'classic', asked: '1.2.0' } }), false);     // "Not now" this version
  assert.equal(M.repairNeeded({ ...b, state: { mode: 'classic', asked: '1.1.0' } }), true);
  assert.equal(M.repairNeeded({ ...b, state: {} }), false);                                      // never set up
});
test('Asked round-trips through the registry', () => {
  const key = 'HKCU\\Software\\Sastra PDF Test\\ExplorerMenu-' + process.pid;
  try { M.writeState({ mode: 'classic', asked: '1.2.0' }, key); assert.equal(M.readState(key).asked, '1.2.0'); }
  finally { M.clearState(key); }
});
```

- [ ] **Step 2: Run** — `node --test "$T/unit/menu-repair.test.js"` → FAIL (`M.repairNeeded is not a function`).
- [ ] **Step 3: Implement** — add `Asked: 'asked'` to `FIELDS`; add `repairNeeded` (true only for build ≥ 22000, msix present, `mode === 'classic'`, `declined !== '1'`, `asked !== version`) next to `install`; export it.
- [ ] **Step 4: Run** — PASS (2 tests).
- [ ] **Step 5: Commit** — `git commit -am "feat: explorer-menu repairNeeded and the Asked state"`

---

### Task 3: Packaging — electron-updater, update address, installer name, credits

**Files:**
- Modify: `package.json` (dependencies, scripts, build), `app/index.html:687-695` (`CREDITS`, `CREDITS_NOTE`), `scripts/check-credits.js:8` (`libs`)
- Test: `$T\packcheck.js` (exists from the pnpm switch; extend it)

**Interfaces:**
- Produces: packed `resources/app-update.yml` with `url: https://sastra-update.smith89k.com/`; `node_modules/electron-updater` inside app.asar; `updater.js` inside app.asar.

- [ ] **Step 1: Extend `$T\packcheck.js`** so it also expects `updater.js`, `node_modules/electron-updater/package.json` (version `6.8.9`) inside app.asar, and reads `pack/win-unpacked/resources/app-update.yml` expecting `provider: generic` and `url: https://sastra-update.smith89k.com/`. Expected extra entries under `node_modules/` are allowed (no longer "extra").
- [ ] **Step 2: Run it against a fresh pack** (`pnpm exec electron-builder --win dir --publish never "-c.directories.output=$T/pack"`, then `node "$T/packcheck.js"`) → FAIL (no updater.js, no electron-updater, no app-update.yml).
- [ ] **Step 3: Change package.json**
  - `pnpm add electron-updater@6.8.9 --save-exact` (goes to `dependencies`).
  - `scripts.dist` / `scripts.dist:portable`: add `--publish never` to the electron-builder call.
  - `build.files`: add `"updater.js"`.
  - `build.publish`: `{ "provider": "generic", "url": "https://sastra-update.smith89k.com/" }` (an object, not an array, so `-c.publish.url=` can override it in Task 8).
  - `build.nsis.artifactName`: `"Sastra-PDF-Setup-${version}.${ext}"`.
  - CREDITS: add `['electron-updater','6.8.9','electron-builder contributors','MIT','https://github.com/electron-userland/electron-builder']` after Electron; CREDITS_NOTE: add one sentence naming the helpers electron-updater ships with (list them from the packed `node_modules` with their licences).
  - check-credits.js `libs`: add `'electron-updater': 'electron-updater'`.
- [ ] **Step 4: Run** — re-pack + `node "$T/packcheck.js"` → PASS; `node scripts/check-credits.js` → "About screen versions match"; the installer size check is Task 8.
- [ ] **Step 5: Commit** — `git add package.json pnpm-lock.yaml app/index.html scripts/check-credits.js && git commit -m "build: electron-updater, the update address and dash-named installers"`

---

### Task 4: main.js + preload.js wiring (and the Playwright harness)

**Files:**
- Modify: `main.js` (requires, `buildMenu` Help, IPC, `whenReady`), `preload.js`
- Create (tests): `$T\package.json`, `$T\launch.js`, `$T\main-wiring-test.js`

**Interfaces:**
- Consumes: Task 1 `updatesRunHere`, `createUpdater`, `installBlock`, `logTo`; Task 2 `repairNeeded`, `readState`, `writeState`, `windowsBuild`.
- Produces (preload `window.sastra`):
  - `checkUpdates() → Promise<{ kind: 'ready'|'downloading'|'current'|'failed'|'dev', version? }>` (IPC `check-updates`)
  - `installUpdate() → Promise<{ ok: true } | { ok: false, reason: 'none'|'task' }>` (IPC `install-update`)
  - `menuRepair(action: 'check'|'later'|'fix') → Promise<{ needed } | {} | { result: 'ok'|'declined'|'failed' }>` (IPC `menu-repair`)
  - `onUpdateReady(fn: (version: string) => void)` (event `update-ready`)
  - menu command `checkUpdates` (through the existing `menu` channel)
- Produces (tests): `$T\launch.js` → `launch({ args = [], exe = null } = {}) → { app, page, ud }` (playwright-core `_electron`; source = `node_modules/electron/dist/electron.exe .`; own `--user-data-dir`; env without `ELECTRON_RUN_AS_NODE`; waits for `html[data-notes]` by polling `page.evaluate`, clicks What's new's `[data-close]` if shown) and `waitFor(page, fn, ms)`.

- [ ] **Step 1: Harness** — in `$T`: `pnpm init`, `pnpm add playwright-core` (record the version in a comment in launch.js); write `launch.js` as above.
- [ ] **Step 2: Write the failing test `$T\main-wiring-test.js`** (plain script, prints `PASS`/`FAIL` per check, exit 1 on any FAIL):
  - from source: `checkUpdates()` → `{ kind: 'dev' }`; `menuRepair('check')` → `{ needed: false }`; `installUpdate()` → `{ ok: false, reason: 'none' }`;
  - Help menu labels via `app.evaluate(({ Menu }) => …)` → `['Check for &Updates…', "What's &New", '&About Sastra PDF']`;
  - `PACKED=1` (exe = `$T\pack\win-unpacked\Sastra PDF.exe` from Task 3): after 15 s, `checkUpdates()` → `{ kind: 'failed' }` (the address has no `latest.yml` yet), and `%TEMP%\Sastra PDF\update.log` has a new line.
- [ ] **Step 3: Run** — `node "$T/main-wiring-test.js"` → FAIL (`window.sastra.checkUpdates is not a function`).
- [ ] **Step 4: Implement**
  - main.js: `const os = require('os');` `const fsSync = require('fs');` (main.js's `fs` is fs/promises) `const updates = require('./updater');` `let up = null;` In `whenReady` after `createWindow()`: if `updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform, portable: !!process.env.PORTABLE_EXECUTABLE_DIR })` → `up = updates.createUpdater({ updater: require('electron-updater').autoUpdater, current: app.getVersion(), send: (ch, v) => { if (win) win.webContents.send(ch, v); }, log: updates.logTo(path.join(os.tmpdir(), 'Sastra PDF', 'update.log')) })` (electron-updater is required only here). Not on the task-only path (`handleTask` returns early) — a menu job never checks.
  - IPC: `check-updates` → `up ? up.checkNow() : { kind: 'dev' }`; `install-update` → `const b = updates.installBlock({ downloaded: up && up.downloaded(), taskOpen: !!taskWin }); if (b) return { ok: false, reason: b }; allowClose = true; up.install(); return { ok: true };`; `menu-repair` → `check`: `{ needed: app.isPackaged && menu.repairNeeded({ build: menu.windowsBuild(), msixExists: fsSync.existsSync(path.join(process.resourcesPath, 'explorer-menu', menu.PKG + '.msix')), state: menu.readState(), version: app.getVersion() }) }`; `later`: `menu.writeState({ asked: app.getVersion() })` → `{}`; `fix`: `execFile(process.execPath, ['--explorer-menu=install'])` (async, so the window doesn't freeze during UAC), then `readState()` → `mode === 'package'` ? `'ok'` : `declined === '1'` ? `'declined'` : `'failed'`.
  - Help menu: `{ label: 'Check for &Updates…', click: () => send('checkUpdates') }` above What's New.
  - preload.js: the four entries above.
- [ ] **Step 5: Run** — from source → PASS; re-pack (Task 3 command) then `PACKED=1 node "$T/main-wiring-test.js"` → PASS.
- [ ] **Step 6: Commit** — `git add main.js preload.js && git commit -m "feat: update and menu-repair calls in main, Help > Check for Updates"`

---

### Task 5: The update boxes in the page

**Files:**
- Modify: `app/index.html` (new section "Updates" after What's new; `desk.onMenu` map gets `checkUpdates`; boot calls nothing new — the event drives it)
- Test: `$T\update-ui-test.js`

**Interfaces:**
- Consumes: Task 4 preload calls.
- Produces (page-internal): `whenFree() → Promise<void>` (resolves when no `.modal-bg` and no `show.el`; a MutationObserver on `document.body` childList), `updateReady(version)`, `restartForUpdate()`, `checkUpdatesCmd()`.

Tests fake main with `app.evaluate`: send events with `BrowserWindow.getAllWindows()[0].webContents.send('update-ready', '9.9.9')`, and swap handlers with `ipcMain.removeHandler(ch); ipcMain.handle(ch, …)` recording calls in `globalThis`.

- [ ] **Step 1: Write the failing test** — checks, each on a fresh launch or after resetting state:
  1. `update-ready 9.9.9` → `.modal.ask p` = `Sastra PDF 9.9.9 is ready to install.`, `.detail` = the spec text, buttons `Later`, `Restart now`, focus on Restart now.
  2. Esc → box gone, `install-update` not called.
  3. Open About (`#bAbout`), then `update-ready` → only one `.modal-bg` (About); close About → the ready box appears.
  4. A dirty doc (open a 3-page PDF via args, `Ctrl+Shift+R`), Restart now → question `<name> has changes that haven't been saved. Restart Sastra PDF anyway?` with `Cancel` / `Restart without saving`; Cancel → `install-update` NOT called, title still starts with `•`.
  5. Same, Restart without saving → `install-update` called once.
  6. `install-update` faked to `{ ok: false, reason: 'task' }` → a box that says Sastra PDF can't restart while a right-click job is running (one `OK` button).
  7. Menu `checkUpdates` (send `menu` `checkUpdates`) with `check-updates` faked to resolve after 500 ms: first `Checking for updates…` with a `.spin`, then `You have the latest version.` for `{ kind: 'current', version: '1.1.0' }`; and `Couldn't check for updates. Check the internet connection and try again.` for `failed`; `Version 9.9.9 is downloading. You'll be asked to restart when it's ready.` for `downloading`; `Updates work only in the installed app.` for `dev`; the ready box for `ready`.
  8. Esc on the Checking box → it closes and no answer box follows.
  9. `update-ready` during Present (F5) → nothing shown until Esc ends the show, then the ready box.
- [ ] **Step 2: Run** — `node "$T/update-ui-test.js"` → FAIL (no box appears).
- [ ] **Step 3: Implement** in index.html: `desk.onUpdateReady(v => updateReady(v))` (only once per version per run); `updateReady` awaits `whenFree()` then `askChoice(…, [['Later','outline'],['Restart now','primary']], { detail })`; `restartForUpdate` reuses the close question wording with "Restart" (`askConfirm(msg, 'Restart without saving', names)`), then `desk.installUpdate()` and the `task` box (detail: wait for the small progress window, then ☰ › Help › Check for Updates, or close Sastra PDF later and it installs then); `checkUpdatesCmd` returns if `$('.modal-bg')`, shows a `.modal-bg` > `.modal.ask` with `<span class="spin"></span>` + `Checking for updates…` (Esc / click outside closes it and drops the answer), then the answer box. Add `checkUpdates: checkUpdatesCmd` to the `desk.onMenu` map.
- [ ] **Step 4: Run** — PASS (9 checks). Also re-run `main-wiring-test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: the update-ready box, Restart now and Check for Updates in the app's own boxes"`

---

### Task 6: The right-click menu repair box

**Files:**
- Modify: `app/index.html` (boot: after `notesAtStart()` call `menuRepairAtStart()`)
- Test: `$T\menu-repair-ui-test.js`

**Interfaces:**
- Consumes: `desk.menuRepair`, `whenFree`.
- Produces: `menuRepairAtStart()`.

- [ ] **Step 1: Write the failing test** — swap main's `menu-repair` handler with `app.evaluate` right after launch, then `page.reload()` so the page boots again against the fake (the swap lives in main, so it survives the reload); record every action:
  1. `check` → `{ needed: true }` → box with the spec copy, buttons `Not now` / `Set up`, focus on Set up.
  2. Not now (or Esc) → `later` called; no toast.
  3. Set up with `fix` → `{ result: 'ok' }` → toast `The right-click menu is back`; `declined` → `The right-click menu stays under "Show more options"`; `failed` → `Couldn't set up the right-click menu` (error toast).
  4. `check` → `{ needed: false }` → no box.
  5. Fresh profile (What's new shows): the repair box appears only after What's new is closed.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `menuRepairAtStart()` — `desk.menuRepair('check')`, if needed `await whenFree()`, then `askChoice`; Set up → `desk.menuRepair('fix')` and the toast; Not now → `desk.menuRepair('later')`. Change boot to `notesAtStart().then(menuRepairAtStart)` — keep `data-notes` set before the repair box (tests wait on it).
- [ ] **Step 4: Run** — PASS; re-run `update-ui-test.js` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: offer to set the right-click menu up again after an update"`

---

### Task 7: The release workflow, release notes and pruning scripts

**Files:**
- Create: `scripts/release-notes.js`, `scripts/r2-prune.js`
- Replace: `.github/workflows/release.yml`
- Test: `$T\unit\release.test.js`

**Interfaces:**
- Produces:
  - `scripts/release-notes.js`: `loadNotes(file) → NOTES` (vm, as check-notes.js), `notesMarkdown(entry) → string`; CLI `node scripts/release-notes.js <version>` prints it, exit 1 when there is no entry.
  - `scripts/r2-prune.js`: `pruneList(keys: string[], keep: string) → string[]`; CLI reads keys (one per line) from stdin, prints the keys to delete, exit 1 with a message when `keep` is not listed.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test'), assert = require('node:assert/strict');
const { notesMarkdown } = require('C:/_httdocs/SastraPDF/scripts/release-notes.js');
const { pruneList } = require('C:/_httdocs/SastraPDF/scripts/r2-prune.js');
test('notesMarkdown: kinds in order, only those present', () => {
  const e = { version: '1.2.0', date: '2026-10-20', notes: [{ kind: 'fixed', text: 'B' }, { kind: 'new', text: 'A' }, { kind: 'new', text: 'C' }] };
  assert.equal(notesMarkdown(e), '## New\n- A\n- C\n\n## Fixed\n- B\n');
});
test('pruneList keeps the new installer, the fixed copy and every blockmap', () => {
  const keys = ['latest.yml', 'Sastra-PDF-Setup.exe', 'Sastra-PDF-Setup-1.1.0.exe\r', 'Sastra-PDF-Setup-1.1.0.exe.blockmap', 'Sastra-PDF-Setup-1.2.0.exe', 'None'];
  assert.deepEqual(pruneList(keys, 'Sastra-PDF-Setup-1.2.0.exe'), ['Sastra-PDF-Setup-1.1.0.exe']);
});
test('pruneList refuses when the new installer is not in the bucket', () => {
  assert.throws(() => pruneList(['Sastra-PDF-Setup-1.1.0.exe'], 'Sastra-PDF-Setup-1.2.0.exe'), /not in the bucket/);
});
```

- [ ] **Step 2: Run** — `node --test "$T/unit/release.test.js"` → FAIL (modules missing).
- [ ] **Step 3: Write the two scripts** (CommonJS, `module.exports` + `if (require.main === module)` CLI). Then `node scripts/release-notes.js 1.1.0` prints the 1.1.0 notes.
- [ ] **Step 4: Replace `.github/workflows/release.yml`** (header comment: what it does, that it only runs by hand, and docs/updates-setup.md):

```yaml
name: Release
on:
  workflow_dispatch:
    inputs:
      version: { description: 'Version to release, = package.json (e.g. 1.2.0)', required: true }
permissions: { contents: write }
concurrency: { group: release, cancel-in-progress: false }
jobs:
  build:
    runs-on: windows-latest
    timeout-minutes: 40
    defaults: { run: { shell: bash } }
    env:
      VERSION: ${{ inputs.version }}
      EXE: Sastra-PDF-Setup-${{ inputs.version }}.exe
      AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
      AWS_DEFAULT_REGION: auto
      AWS_REQUEST_CHECKSUM_CALCULATION: when_required
      AWS_RESPONSE_CHECKSUM_VALIDATION: when_required
      R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
      R2_BUCKET: ${{ secrets.R2_BUCKET }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: pnpm }
      - name: Version and secrets are right, and not released yet
        run: |   # input = package.json; no release v$VERSION; all 4 R2 secrets set — each with a plain ::error::
      - run: pnpm install --frozen-lockfile
      - run: node scripts/check-notes.js
      - run: node scripts/build-explorer-menu.js
      - run: pnpm exec electron-builder --win nsis --publish never
      - name: The build has the installer, its blockmap and latest.yml naming it
        run: |   # dist/$EXE, dist/$EXE.blockmap, dist/latest.yml containing "url: $EXE"
      - uses: actions/upload-artifact@v7
        with: { name: installer, path: 'dist/*.exe', retention-days: 5, compression-level: 0 }
      - name: Upload to R2 (installer first, latest.yml last)
        run: |   # put() = aws s3 cp … --endpoint-url "$R2_ENDPOINT", then head-object ContentLength == local size
                 # 1) $EXE and $EXE.blockmap   2) $EXE as Sastra-PDF-Setup.exe with --cache-control no-cache
                 #    --content-type application/octet-stream --content-disposition "attachment; filename=\"$EXE\""
                 # 3) latest.yml with --cache-control no-cache
      - name: Remove older installers from R2
        run: |   # aws s3api list-objects-v2 --query 'Contents[].[Key]' --output text | node scripts/r2-prune.js "$EXE"
                 # then aws s3 rm each printed key
      - name: GitHub release
        run: |   # node scripts/release-notes.js "$VERSION" > notes.md; append SHA-256 of dist/$EXE and the download link
                 # gh release create "v$VERSION" "dist/$EXE" --target "$GITHUB_SHA" --title "Sastra PDF $VERSION" --notes-file notes.md
```

  The `run: |` blocks are written out in full by the implementer from the comments; every failure prints `::error::` in plain words.
- [ ] **Step 5: Check** — `node --test "$T/unit/release.test.js"` → PASS; the workflow parses: `node -e "const y=require(require.resolve('js-yaml',{paths:[require('fs').realpathSync('node_modules/electron-updater')]}));y.load(require('fs').readFileSync('.github/workflows/release.yml','utf8'));console.log('ok')"` → `ok`; and `bash -n` on each `run:` block (extract with the same js-yaml) → no output.
- [ ] **Step 6: Commit** — `git add scripts/release-notes.js scripts/r2-prune.js .github/workflows/release.yml && git commit -m "ci: release by hand to Cloudflare R2, notes from What's new"`

---

### Task 8: A real update on this PC (end-to-end)

Proves the spec's "a real update must be seen working". Uses a SEPARATE test app so the user's installed Sastra PDF, its shortcuts, the .pdf association and the right-click menu are never touched.

**Files (tests only):** `$T\e2e\make-config.js`, `$T\e2e\serve.js`, `$T\e2e\run.js`

- [ ] **Step 1: `make-config.js <version> <outDir> <url>`** — writes `$T\e2e\builder-<version>.json` = package.json `build` with: `appId: 'kh.sastra.pdf.e2e'`, `productName: 'Sastra PDF E2E'`, `extraMetadata: { name: 'sastra-pdf-e2e', productName: 'Sastra PDF E2E', version }` (own userData, own single-instance lock, own updater cache), `publish.url = url`, `directories.output = outDir`, no `fileAssociations`, no `extraResources` (no menu files → no repair offer), `nsis.include` removed (installer never touches the menu), `nsis.shortcutName: 'Sastra PDF E2E'`, `createDesktopShortcut: false`, `createStartMenuShortcut: false`.
- [ ] **Step 2: `serve.js <dir> <port>`** — static files with `Cache-Control: no-cache`, logs each request.
- [ ] **Step 3: Build A (9.0.0) and B (9.0.1)** — `pnpm exec electron-builder --win nsis --publish never --config "$T/e2e/builder-9.0.0.json"` (and 9.0.1), url `http://127.0.0.1:8765/`. Note the installer size vs the 1.1.0 build (≈ +1 MB expected).
- [ ] **Step 4: `run.js`** (serve B; prints PASS/FAIL):
  1. Install A silently (`Sastra-PDF-Setup-9.0.0.exe /S`), launch the installed `Sastra PDF E2E.exe` with playwright-core (own `--user-data-dir`), wait ≤ 60 s for `Sastra PDF 9.0.1 is ready to install.` → Later → close the window → poll the installed exe's ProductVersion until `9.0.1` (≤ 120 s).
  2. Install A again; launch with a PDF; `Ctrl+Shift+R`; ready box → Restart now → question → Cancel → after 15 s still running, title starts with `•`, version still 9.0.0.
  3. ☰ › Help › Check for Updates (send menu `checkUpdates`) → ready box → Restart now → Restart without saving → the app exits, then a new `Sastra PDF E2E.exe` process starts by itself (≤ 120 s) and the installed version is 9.0.1.
  4. `update.log` has lines for the checks.
  5. Cleanup always (finally): kill test processes, run `Uninstall Sastra PDF E2E.exe /S`, stop the server; the user's own install folder and its `latest` version are unchanged (compare before/after).
- [ ] **Step 5: Run** — `node "$T/e2e/run.js"` → all PASS. If something fails, fix the code in its task and repeat.
- [ ] **Step 6: Commit** — nothing in the project changes unless a fix was needed (then commit that fix with its task's message style).

---

### Task 9: Docs, privacy text, What's new

**Files:**
- Create: `docs/updates-setup.md`
- Modify: `README.md` (Features "Works fully offline", Download, Privacy policy), `app/notes.js` (top entry), `CLAUDE.md`

- [ ] **Step 1: `docs/updates-setup.md`** — click by click: (1) R2 → Create bucket (name of the user's choice); (2) bucket → Settings → Custom Domains → Connect `sastra-update.smith89k.com`; leave r2.dev off; (3) R2 → Manage API tokens → Object Read & Write, this bucket only → Access Key ID, Secret, Account ID; (4) GitHub → SastraPDF → Settings → Secrets and variables → Actions → the 4 secrets; (5) check: `curl -I https://sastra-update.smith89k.com/latest.yml` → 404 before the first release, 200 after; (6) releasing: bump version + What's new + push main → Actions → Release → Run workflow → version; (7) the download link; (8) first install by hand for older copies; SmartScreen "More info → Run anyway" (unsigned); (9) a leaked R2 key: make a new token, update 2 secrets — installed copies hold no key and keep updating.
- [ ] **Step 2: README** — Download: the fixed link first, GitHub releases as backup; Privacy policy: the only thing the app does online by itself is check `https://sastra-update.smith89k.com/` for a newer version and download it; nothing about the user or their files is sent; "Works fully offline; files never leave the computer" stays true (add "updates need internet").
- [ ] **Step 3: What's new** — add to the top entry in app/notes.js: `['new', 'Sastra PDF now updates itself. When a new version is ready it asks to restart, or installs it when you close the app. Check by hand from ☰ › Help › Check for Updates.']`. Run `node scripts/check-notes.js` → OK.
- [ ] **Step 4: CLAUDE.md** — project layout (updater.js, scripts/release-notes.js, scripts/r2-prune.js, docs/updates-setup.md), the privacy rule's update-check exception in "Design", the new release process replacing the tag-push one in Status, the dash-named installer, the E2E test app trick, and where the tests live.
- [ ] **Step 5: Commit** — `git add docs/updates-setup.md README.md app/notes.js CLAUDE.md && git commit -m "docs: update setup, privacy text and What's new for automatic updates"`

---

### Task 10: First real release (with the user)

Not automatic: it needs the user's Cloudflare login and their choice of version.

- [ ] **Step 1:** The user follows docs/updates-setup.md sections 1–5; check together with curl (404 = ready).
- [ ] **Step 2:** Ask the user before pushing main; push.
- [ ] **Step 3:** The user runs Actions → Release with the version (package.json, e.g. 1.1.0); watch the run (`gh run watch`). A billing error means GitHub Pro hasn't taken effect yet.
- [ ] **Step 4:** Check the bucket: `curl -I` on `latest.yml` (200, `cache-control: no-cache`), on `Sastra-PDF-Setup.exe` (200, `content-disposition` with the version), and download it once; SHA-256 = the release notes'.
- [ ] **Step 5:** The user installs from the link (replacing their local 1.1.0 build); the next release proves the update for real.

# Sastra PDF in the Microsoft Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release 1.2.0 makes the installer (to R2, as today) AND an MSIX package for the Microsoft Store (no update key, right-click menu and `.pdf` "Open with" from its manifest, Store updates), proved first on this PC; after Microsoft publishes it, releases make only the Store package.

**Architecture:** A plain-Node module `store.js` holds the Store copy's rules (which copy is the Store one, its Partner Center identity in `store.json`, the Store page link). main.js asks it and switches off self-update, the right-click menu setup and repair, and the DLL clean-up in the Store copy, and gives that copy its own settings-folder name (so its single-instance lock never meets an installer copy's). menu.cpp starts the app directly when its DLL runs inside the Store package, so the app runs inside that package too. A second electron-builder run (`build/store.config.js` → `scripts/store-config.js`) builds the appx target from the installer's own config with a custom manifest (`build/store-manifest.xml`). `scripts/menu-sources.js` checks the three places that declare the menu agree; `scripts/store-check.js` checks the built package. The release job builds and checks it and attaches it to the GitHub release (never R2).

**Tech Stack:** Electron 44.7.2, electron-builder 26.15.3 (appx target), plain CommonJS, C++ (menu.cpp, MSVC), GitHub Actions (windows-latest; later ubuntu-latest too), node:test for unit tests, playwright-core for the app test.

**Spec:** docs/superpowers/specs/2026-10-19-microsoft-store-design.md. Sister app: E:\_httdocs\Bohpum (its plan docs/superpowers/plans/2026-10-19-microsoft-store.md, store.js, build/store.config.js, scripts/store-config.js, build/store-manifest.xml, scripts/store-check.js, .github/workflows/release.yml).

## Global Constraints

- Work and commit on `main` only. Never push, release, or build the installer or the Store package (`pnpm run dist`, `pnpm run dist:store`, any `electron-builder` run) without the user's yes. `pnpm run build:menu` (the DLL, seconds) needs no yes.
- Every shell that starts Electron or `Sastra PDF.exe` clears `ELECTRON_RUN_AS_NODE` first (bash: `unset ELECTRON_RUN_AS_NODE`; PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`).
- The installer stays as it is: package.json `build` changes only by adding `"store.js"` to `files`.
- Store package: target `appx`, output folder `dist-store/`, file `Sastra-PDF-Store-${version}.msix`, `applicationId` `SastraPDF`, `displayName` `Sastra PDF`, `minVersion` `10.0.19041.0`, `maxVersionTested` `10.0.26100.0`, `languages` `['en-US']`, `backgroundColor` `transparent`, not signed (Partner Center signs it). 1.2.0 becomes 1.2.0.0.
- Never inside the Store package: `update-config.json` (the update key), `app-update.yml`, `SastraPDF.ExplorerMenu.msix`.
- Menu: CLSID `{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}` (explorer-menu.js `CLSID`); file types = explorer-menu.js `EXTS` = `.pdf .jpg .jpeg .jfif .png .bmp .gif .webp`; in the Store package the DLL is at `app\resources\explorer-menu\SastraMenu.dll`.
- Test identity (sideloaded, unsigned): `SastraPDF.StoreTest`, publisher `CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1`. Test switch: `SASTRA_STORE_TEST=1`, honoured only when `!app.isPackaged`. Sideload build switch: `SASTRA_STORE_SIDELOAD=1`.
- Store ID format: 12 characters, digits and capital letters. The four Partner Center values come from the user; never guess them. (Bohpum, same account: publisher `CN=AAA3A883-09DC-4D02-89C9-CD2286F692F0`, display name `Taing Sunnguon` — Sastra's should match, but read them from Partner Center.)
- The Gmail address never goes into this repository (it was removed from its whole history on 2026-10-19).
- Tests live outside the repo: `T` = the same test folder as the drop-into-pages plan (its Task 1 Step 1 makes it, with playwright-core and notes-skip.js, on any PC). Unit tests: `node --test "$T/unit/<name>.test.js"`. Test files use `ROOT`/`APP = 'E:/_httdocs/SastraPDF'`: change it if the repository is elsewhere. The DLL harness and the older suites (`OLD = C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t`) exist only on the first PC: elsewhere skip those steps, tell the user, and run them back on the first PC. Building the DLL (`pnpm run build:menu`) needs Visual Studio Build Tools (C++ x64) and the Windows SDK on that PC.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The installer copy must behave exactly as before** (updates, menu setup, repair question, clean-up): every Store switch is gated on `STORE`, which is false unless Windows says `process.windowsStore` or a source run sets the test switch. Pinned in Task 3 (the same build without the switch answers `dev` / exit 2).
2. **No update key in the Store package**: the release deletes `update-config.json` before the Store build, the config leaves it out, and `store-check.js` refuses a package that has it. Pinned in Tasks 5, 7, 8.
3. **A menu job from the Store package reaches the Store copy, inside its package** (else it reads another temp folder and another settings folder). Pinned by code in Task 4, proved on this PC in Task 10.
4. **Store copy and installer copy running at once each keep their own window.** Pinned by code in Task 3 (own settings-folder name), proved in Task 10.

---

### Task 1: store.js — the Store copy's rules

**Files:**
- Create: `store.js`
- Modify: `package.json` (`build.files`: add `"store.js"` after `"updater.js"`)
- Test: `$T/unit/store.test.js`

**Interfaces:**
- Produces: `parseStoreInfo(text) → { identityName, publisher, publisherDisplayName, storeId } | null`; `readStoreInfo(file) → same | null`; `SIDELOAD` (frozen `{ identityName:'SastraPDF.StoreTest', publisher:'CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1', publisherDisplayName:'Sunnguon Taing', storeId:null }`); `isStoreCopy({ windowsStore, test = false }) → boolean`; `storePageUrl(info) → string`.

- [ ] **Step 1: Write the failing test** — `$T/unit/store.test.js`:

```js
// store.js: the Microsoft Store copy's rules, with no Electron inside.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = 'E:/_httdocs/SastraPDF';
const ID = { identityName: 'smith89k.SastraPDF', publisher: 'CN=12345678-90AB-CDEF-1234-567890ABCDEF', publisherDisplayName: 'Taing Sunnguon', storeId: '9NSASTRA0000' };

test('which copy is the Store one', () => {
  const s = require(ROOT + '/store.js');
  assert.equal(s.isStoreCopy({ windowsStore: true }), true);
  assert.equal(s.isStoreCopy({ windowsStore: undefined, test: true }), true);
  assert.equal(s.isStoreCopy({ windowsStore: undefined }), false);
  assert.equal(s.isStoreCopy({ windowsStore: false, test: false }), false);
});
test('store.json: the four Partner Center values, or nothing', () => {
  const s = require(ROOT + '/store.js');
  assert.deepEqual(s.parseStoreInfo(JSON.stringify(ID)), ID);
  for (const bad of [{ ...ID, identityName: 'x' }, { ...ID, publisher: 'Sastra' }, { ...ID, publisherDisplayName: ' ' }, { ...ID, storeId: '9nsastra0000' }, { ...ID, storeId: undefined }])
    assert.equal(s.parseStoreInfo(JSON.stringify(bad)), null, JSON.stringify(bad));
  assert.equal(s.parseStoreInfo('not json'), null);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sastra-store-')), 'store.json');
  assert.equal(s.readStoreInfo(f), null);   // missing file
  fs.writeFileSync(f, JSON.stringify(ID)); assert.deepEqual(s.readStoreInfo(f), ID);
});
test('the sideloaded test identity: unsigned-package OID, no Store ID, frozen', () => {
  const s = require(ROOT + '/store.js');
  assert.equal(s.SIDELOAD.identityName, 'SastraPDF.StoreTest');
  assert.equal(s.SIDELOAD.publisher, 'CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1');
  assert.equal(s.SIDELOAD.storeId, null);
  assert.ok(Object.isFrozen(s.SIDELOAD));
});
test('Check for Updates opens the Store page, or Downloads and updates without a Store ID', () => {
  const s = require(ROOT + '/store.js');
  assert.equal(s.storePageUrl(ID), 'ms-windows-store://pdp/?ProductId=9NSASTRA0000');
  assert.equal(s.storePageUrl(s.SIDELOAD), 'ms-windows-store://downloadsandupdates');
  assert.equal(s.storePageUrl(null), 'ms-windows-store://downloadsandupdates');
});
test('the installer carries store.js (main.js needs it)', () => {
  assert.ok(require(ROOT + '/package.json').build.files.includes('store.js'));
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/store.test.js"`
Expected: FAIL with `Cannot find module 'E:/_httdocs/SastraPDF/store.js'`.

- [ ] **Step 3: Create `store.js`**

```js
// Sastra PDF — the Microsoft Store copy: an MSIX package that Microsoft signs and the Store updates (design:
// docs/superpowers/specs/2026-10-19-microsoft-store-design.md). It has no update key and gets its right-click menu and
// the .pdf "Open with" entry from its package manifest (build/store-manifest.xml). No Electron here: main.js and
// build/store.config.js use it, so the rules are plain-Node testable.
const fs = require('fs');

// store.json = Partner Center › Product identity: { identityName, publisher, publisherDisplayName, storeId } → that,
// or null when anything is off. Not secret: anyone can read it in the Store package.
function parseStoreInfo(text) {
  let c; try { c = JSON.parse(text); } catch { return null; }
  const { identityName, publisher, publisherDisplayName, storeId } = c || {};
  if (typeof identityName !== 'string' || !/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) return null;
  if (typeof publisher !== 'string' || !/^CN=./.test(publisher)) return null;
  if (typeof publisherDisplayName !== 'string' || !publisherDisplayName.trim()) return null;
  if (typeof storeId !== 'string' || !/^[0-9A-Z]{12}$/.test(storeId)) return null;
  return { identityName, publisher, publisherDisplayName, storeId };
}
function readStoreInfo(file) { try { return parseStoreInfo(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// A test package for this PC, installed with Add-AppxPackage -AllowUnsigned: Windows takes an unsigned package only
// with this OID in Publisher (as explorer-menu/AppxManifest.xml). Never sent to the Store, so it has no Store ID.
const SIDELOAD = Object.freeze({
  identityName: 'SastraPDF.StoreTest', publisher: 'CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1',
  publisherDisplayName: 'Sunnguon Taing', storeId: null
});

// Windows sets process.windowsStore in an app started from its MSIX package; tests say so with SASTRA_STORE_TEST.
function isStoreCopy({ windowsStore, test = false }) { return windowsStore === true || test === true; }

// Help › Check for Updates in the Store copy: Sastra PDF's page in the Store app (its Update button), or the Store's
// Downloads and updates when the copy has no Store ID (the sideloaded test package).
function storePageUrl(info) {
  return info && info.storeId ? `ms-windows-store://pdp/?ProductId=${info.storeId}` : 'ms-windows-store://downloadsandupdates';
}

module.exports = { parseStoreInfo, readStoreInfo, SIDELOAD, isStoreCopy, storePageUrl };
```

In `package.json` `build.files`, after `"updater.js",` add `"store.js",`.

- [ ] **Step 4: Run it — it passes**

Run: `node --test "$T/unit/store.test.js"`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add store.js package.json && git commit -m "feat: store.js — the Microsoft Store copy's rules (identity, test package, Store page)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: updater.js — the Store copy never updates itself

**Files:**
- Modify: `updater.js:10-11`
- Test: `$T/unit/updater-store.test.js`

**Interfaces:**
- Produces: `updatesRunHere({ packaged, platform, portable, store = false }) → boolean` (false when `store === true`).

- [ ] **Step 1: Write the failing test** — `$T/unit/updater-store.test.js`:

```js
const test = require('node:test'), assert = require('node:assert');
const { updatesRunHere } = require('E:/_httdocs/SastraPDF/updater.js');
test('the installed app updates itself; pnpm start, the portable exe and the Store copy do not', () => {
  assert.equal(updatesRunHere({ packaged: true, platform: 'win32', portable: false }), true);
  assert.equal(updatesRunHere({ packaged: true, platform: 'win32', portable: false, store: false }), true);
  assert.equal(updatesRunHere({ packaged: true, platform: 'win32', portable: false, store: true }), false);
  assert.equal(updatesRunHere({ packaged: false, platform: 'win32', portable: false }), false);
  assert.equal(updatesRunHere({ packaged: true, platform: 'win32', portable: true }), false);
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/updater-store.test.js"`
Expected: FAIL at the `store: true` line (`true !== false`).

- [ ] **Step 3: Implement** — in `updater.js` replace lines 10–11:

```js
// Only the installed Windows app updates itself: not `pnpm start`, not the portable .exe, and not the Microsoft Store
// copy (the Store updates it; store.js).
function updatesRunHere({ packaged, platform, portable, store = false }) { return packaged === true && platform === 'win32' && !portable && store !== true; }
```

- [ ] **Step 4: Run it — it passes**

Run: `node --test "$T/unit/updater-store.test.js"` → `# pass 1`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add updater.js && git commit -m "feat: updater.js — the Microsoft Store copy never updates itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: main.js and the page — wire the Store copy

**Files:**
- Modify: `main.js:9` (require), `main.js:17` (Store block after `let up`), `main.js:21-29` (`--explorer-menu`), `main.js:389` (`check-updates`), `main.js:403` (menu repair), `main.js:424` (`cleanOld`), `main.js:431` (updater)
- Modify: `app/index.html:952` (`checkUpdatesCmd`, after `done();`)
- Test: `$T/store-wiring-test.js`

**Interfaces:**
- Consumes: Task 1 `store.isStoreCopy`, `store.readStoreInfo`, `store.storePageUrl`; Task 2 `updatesRunHere({ store })`.
- Produces: IPC `check-updates` answers `{ kind: 'store' }` in the Store copy (after opening the Store page); `menu-repair` `'check'` answers `{ needed: false }` there; `--explorer-menu=…` exits 0 there. Constants `STORE`, `STORE_INFO` in main.js.

- [ ] **Step 1: Write the failing test** — `$T/store-wiring-test.js`:

```js
// main.js as the Microsoft Store copy (SASTRA_STORE_TEST=1 stands in for process.windowsStore): Help › Check for
// Updates opens the Store and leaves no box; the menu repair question is never needed; --explorer-menu=… does nothing
// and exits 0. Without the switch the same source answers as before (dev, exit 2).
const { _electron } = require('playwright-core');
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, EXE = path.join(APP, 'node_modules/electron/dist/electron.exe');
const store = require(APP + '/store.js');
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { ...process.env }; delete base.ELECTRON_RUN_AS_NODE;

async function open(storeTest){
  const ud = path.join(T, storeTest ? 'ud-store' : 'ud-nostore'); fs.rmSync(ud, { recursive: true, force: true });
  const env = { ...base, ...(storeTest ? { SASTRA_STORE_TEST: '1' } : {}) };
  const app = await _electron.launch({ executablePath: EXE, args: [APP, '--user-data-dir=' + ud], env });
  const page = await app.firstWindow(); await require('./notes-skip')(page);
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async u => { global.__opened.push(u); }; });
  return { app, page };
}
(async () => {
  const menuRun = extra => spawnSync(EXE, [APP, '--explorer-menu=install'], { env: { ...base, ...extra }, timeout: 30000 }).status;
  check('--explorer-menu=install in the Store copy: nothing to set up, exit 0', menuRun({ SASTRA_STORE_TEST: '1' }) === 0);
  check('…from source without the switch: exit 2, as before', menuRun({}) === 2);

  let { app, page } = await open(true);
  const want = store.storePageUrl(store.readStoreInfo(path.join(APP, 'store.json')));
  check('check-updates answers "store" and opens Sastra PDF in the Store', JSON.stringify(await page.evaluate(() => window.sastra.checkUpdates())) === '{"kind":"store"}'
    && JSON.stringify(await app.evaluate(() => global.__opened)) === JSON.stringify([want]), { want, opened: await app.evaluate(() => global.__opened) });
  await app.evaluate(() => { global.__opened = []; });
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === '&Help').submenu.items.find(i => i.label.startsWith('Check for')).click());
  await sleep(1000);
  check('Help › Check for Updates… opens the Store and leaves no box', JSON.stringify(await app.evaluate(() => global.__opened)) === JSON.stringify([want])
    && await page.evaluate(() => !document.querySelector('.modal-bg')));
  check('the menu repair question is never needed', JSON.stringify(await page.evaluate(() => window.sastra.menuRepair('check'))) === '{"needed":false}');
  await app.close();

  ({ app, page } = await open(false));
  check('without the switch: check-updates still answers "dev" and opens nothing', JSON.stringify(await page.evaluate(() => window.sastra.checkUpdates())) === '{"kind":"dev"}'
    && (await app.evaluate(() => global.__opened)).length === 0);
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```

- [ ] **Step 2: Run it — it fails**

Run: `cd "$T" && node store-wiring-test.js`
Expected: `FAIL  --explorer-menu=install in the Store copy …` (exit 2) and `FAIL  check-updates answers "store" …` (`{"kind":"dev"}`).

- [ ] **Step 3: main.js — the Store block.** After line 9 (`const updates = require('./updater');`) add:

```js
const store = require('./store');
```

After line 17 (`let up = null;              // automatic updates (updater.js), only in the installed app`) add:

```js

// The Microsoft Store copy (store.js): Windows says so (process.windowsStore). Tests only (never in the installed app):
// SASTRA_STORE_TEST=1 makes `electron .` act as one.
const STORE = store.isStoreCopy({ windowsStore: process.windowsStore, test: !app.isPackaged && process.env.SASTRA_STORE_TEST === '1' });
const STORE_INFO = STORE ? store.readStoreInfo(path.join(__dirname, 'store.json')) : null;   // its Store ID, for Check for Updates
// Its own settings folder name: the single-instance lock is named from that path, and an installer copy on the same PC
// uses "Sastra PDF". Windows keeps the Store copy's files apart already, but not the lock's name.
if (process.windowsStore) app.setPath('userData', path.join(app.getPath('appData'), 'Sastra PDF Store'));
```

- [ ] **Step 4: main.js — menu commands do nothing in the Store copy.** Replace

```js
  process.exit(app.isPackaged ? menu.runCommand(menuCmd, {
```

with

```js
  // the Store copy's menu comes with its package (build/store-manifest.xml): nothing to set up or remove
  process.exit(STORE ? 0 : app.isPackaged ? menu.runCommand(menuCmd, {
```

- [ ] **Step 5: main.js — Check for Updates opens the Store.** Replace

```js
ipcMain.handle('check-updates', () => up ? up.checkNow() : { kind: 'dev' });
```

with

```js
// The Store copy: the Store updates it, so Check for Updates opens Sastra PDF's page there (store.js storePageUrl).
ipcMain.handle('check-updates', () => {
  if (STORE) { shell.openExternal(store.storePageUrl(STORE_INFO)).catch(() => {}); return { kind: 'store' }; }
  return up ? up.checkNow() : { kind: 'dev' };
});
```

- [ ] **Step 6: main.js — no menu repair, no DLL clean-up, no updater in the Store copy.**

Replace `    return { needed: app.isPackaged && menu.repairNeeded({` with:

```js
    return { needed: app.isPackaged && !STORE && menu.repairNeeded({
```

Replace `  if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath));` with:

```js
  if (app.isPackaged && !STORE) menu.cleanOld(path.dirname(process.execPath));   // the Store copy has no DLL moved aside
```

Replace `  if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform, portable: !!process.env.PORTABLE_EXECUTABLE_DIR })) {` with:

```js
  if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform, portable: !!process.env.PORTABLE_EXECUTABLE_DIR, store: STORE })) {
```

- [ ] **Step 7: the page — no box for the Store answer.** In `app/index.html` `checkUpdatesCmd`, after the line `  done();` (line 952) add:

```js
  if (a.kind === 'store') return;   // main opened Sastra PDF's page in the Store, which updates this copy
```

- [ ] **Step 8: Run it and the suites around it — they pass**

Run: `cd "$T" && node store-wiring-test.js`
Expected: 6 × `PASS`, `ALL PASS`.
Also: `cd "$OLD" && node close-test.js | tail -2` → `ALL PASS` (main.js changed).

- [ ] **Step 9: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add main.js app/index.html && git commit -m "feat: the Microsoft Store copy never updates itself or sets up the menu; Check for Updates opens the Store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: menu.cpp — inside the Store package, start the app inside it too

**Files:**
- Modify: `explorer-menu/menu.cpp` (includes; new `InStorePackage` before `Launch`; `Launch`'s first launch line)

**Why:** a menu click from the Store package runs SastraMenu.dll in a helper process that has the Store package's identity. Started through Explorer (`ShellLaunch`), the app would run outside the package: another temp folder (it may not see the list file) and another settings folder. A packaged process's children run in its package, so there `DirectLaunch` (CreateProcess) is right. The installer's sparse package (`SastraPDF.ExplorerMenu`) and the classic menu (no package) keep `ShellLaunch`, so the app never runs inside the add-on's identity.

- [ ] **Step 1: Build the DLL and run the DLL harness first (baseline)**

```bash
unset ELECTRON_RUN_AS_NODE; cd /e/_httdocs/SastraPDF && pnpm run build:menu
OLD="/c/Users/taing/AppData/Local/Temp/claude/e---httdocs-SastraPDF/4e4e0838-1457-4a28-ac3f-40a6d477efff/scratchpad/t"
cd "$OLD/harness" && cmd //c build.bat && node make-files.js && ./menu-harness.exe | tail -3
```

Expected: `build-explorer-menu: … ready`, `HARNESS-BUILT`, the harness ends with its pass count (39) and no FAIL.

- [ ] **Step 2: Implement.** In `explorer-menu/menu.cpp`, after `#include <windows.h>` add:

```cpp
#include <appmodel.h>
```

Just above `static HRESULT Launch(Act a, const std::vector<std::wstring>& paths) {` add:

```cpp
// Inside the Microsoft Store package (any package but the installer's sparse SastraPDF.ExplorerMenu) this DLL runs in a
// helper process with that package's identity. The app must run inside the package too (its own temp and settings
// folders), and a packaged process's children do: start it directly. No package (classic menu) or the sparse one:
// through Explorer, so the app never runs inside the add-on's identity.
static bool InStorePackage() {
  UINT32 len = 0;
  if (GetCurrentPackageFamilyName(&len, nullptr) != ERROR_INSUFFICIENT_BUFFER) return false;   // no package
  std::wstring family(len, L'\0');
  if (GetCurrentPackageFamilyName(&len, family.data()) != ERROR_SUCCESS) return false;
  return family.rfind(L"SastraPDF.ExplorerMenu_", 0) != 0;
}
```

In `Launch`, replace

```cpp
  HRESULT hr = test ? E_FAIL : ShellLaunch(exe, args, dir);
```

with

```cpp
  HRESULT hr = test || InStorePackage() ? E_FAIL : ShellLaunch(exe, args, dir);
```

- [ ] **Step 3: Build and run the harness again**

```bash
cd /e/_httdocs/SastraPDF && pnpm run build:menu && cd "$OLD/harness" && ./menu-harness.exe | tail -3
```

Expected: the same pass count as Step 1, no FAIL (the harness runs with no package, so nothing it checks changes).

- [ ] **Step 4: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add explorer-menu/menu.cpp && git commit -m "feat(menu): inside the Store package, start the app directly so it runs in that package too

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: the Store package's build files — config, manifest, pictures, script

**Files:**
- Create: `scripts/store-config.js`, `build/store.config.js`, `build/store-manifest.xml`, `build/appx/StoreLogo.png`, `build/appx/Square44x44Logo.png`, `build/appx/Square150x150Logo.png`, `build/appx/Wide310x150Logo.png`, `build/appx/PdfFile.png`
- Modify: `package.json` (`scripts`: `dist:store`), `.gitignore` (`dist-store/`)
- Test: `$T/unit/store-config.test.js`

**Interfaces:**
- Consumes: Task 1 `store.SIDELOAD`, `store.readStoreInfo`.
- Produces: `scripts/store-config.js` → `NOT_IN_STORE` (`['update-config.json']`), `storeBuildConfig({ base, id, storeJson }) → electron-builder config`; `build/store.config.js` (env `SASTRA_STORE_SIDELOAD=1`); `pnpm run dist:store`; output `dist-store/Sastra-PDF-Store-<version>.msix` and `dist-store/win-unpacked/`.

- [ ] **Step 1: Write the failing test** — `$T/unit/store-config.test.js`:

```js
// The Store package's build files: the installer's own config without the update key, the menu DLL without its sparse
// package, the appx target into dist-store; the manifest's .pdf file type and right-click menu; the pictures. Nothing built.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = 'E:/_httdocs/SastraPDF';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ID = { identityName: 'Test.SastraPDF', publisher: 'CN=TEST', publisherDisplayName: 'Test', storeId: '9TEST0000000' };
const pngSize = f => { const b = fs.readFileSync(f); return b.toString('ascii', 12, 16) === 'IHDR' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

test('storeBuildConfig: no update key, the DLL only, appx into dist-store, no update address', () => {
  const { storeBuildConfig, NOT_IN_STORE } = require(ROOT + '/scripts/store-config.js');
  const c = storeBuildConfig({ base: pkg.build, id: ID, storeJson: true });
  assert.deepEqual(NOT_IN_STORE, ['update-config.json']);
  assert.ok(!c.files.includes('update-config.json') && c.files.includes('store.json') && c.files.includes('store.js'), c.files.join(' '));
  assert.ok(pkg.build.files.filter(f => f !== 'update-config.json').every(f => c.files.includes(f)));
  assert.deepEqual(c.extraResources, [{ from: 'explorer-menu/out', to: 'explorer-menu', filter: ['SastraMenu.dll'] }]);
  assert.equal(c.win.target, 'appx'); assert.equal(c.win.icon, pkg.build.win.icon);
  assert.equal(c.directories.output, 'dist-store'); assert.equal(c.directories.buildResources, 'build'); assert.equal(c.publish, null);
  const a = c.appx;
  assert.deepEqual([a.identityName, a.publisher, a.publisherDisplayName], [ID.identityName, ID.publisher, ID.publisherDisplayName]);
  assert.deepEqual([a.applicationId, a.displayName, a.backgroundColor, a.minVersion, a.maxVersionTested, a.customManifestPath, a.artifactName],
    ['SastraPDF', 'Sastra PDF', 'transparent', '10.0.19041.0', '10.0.26100.0', 'build/store-manifest.xml', 'Sastra-PDF-Store-${version}.msix']);
  assert.deepEqual(a.languages, ['en-US']);
  assert.ok(!storeBuildConfig({ base: pkg.build, id: ID, storeJson: false }).files.includes('store.json'));
  assert.equal(pkg.build.win.target[0], 'nsis'); assert.ok(pkg.build.files.includes('update-config.json'));   // the installer's own config untouched
});
test('build/store.config.js with SASTRA_STORE_SIDELOAD=1: the unsigned test identity, no store.json', () => {
  const store = require(ROOT + '/store.js');
  process.env.SASTRA_STORE_SIDELOAD = '1';
  const side = require(ROOT + '/build/store.config.js');
  assert.equal(side.appx.identityName, store.SIDELOAD.identityName); assert.equal(side.appx.publisher, store.SIDELOAD.publisher);
  assert.ok(!side.files.includes('store.json'));
  const real = path.join(ROOT, 'store.json');
  if (fs.existsSync(real)) assert.ok(store.readStoreInfo(real), 'store.json must hold a valid Partner Center identity');
});
test('the manifest: .pdf file type with its picture, the menu on every file type, the DLL inside the package', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'build', 'store-manifest.xml'), 'utf8');
  const { CLSID, EXTS } = require(ROOT + '/explorer-menu.js'), id = CLSID.slice(1, -1).toLowerCase();
  assert.match(xml, /<uap:FileTypeAssociation Name="pdf">[\s\S]*<uap:Logo>assets\\PdfFile\.png<\/uap:Logo>[\s\S]*<uap:FileType>\.pdf<\/uap:FileType>/);
  const types = [...xml.matchAll(/<desktop5:ItemType Type="([^"]+)">\s*<desktop5:Verb Id="SastraPDF" Clsid="([^"]+)" \/>/g)];
  assert.deepEqual(types.map(t => t[1]), EXTS); assert.ok(types.every(t => t[2].toLowerCase() === id));
  assert.match(xml, /<com:Class Id="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" Path="app\\resources\\explorer-menu\\SastraMenu\.dll" ThreadingModel="STA" \/>/);
  const macros = [...xml.matchAll(/\$\{([a-zA-Z0-9]+)\}/g)].map(m => m[1]);
  const known = ['identityName', 'arch', 'publisher', 'version', 'displayName', 'publisherDisplayName', 'description', 'logo', 'resourceLanguages',
    'minVersion', 'maxVersionTested', 'capabilities', 'applicationId', 'executable', 'backgroundColor', 'square150x150Logo', 'square44x44Logo'];
  assert.ok(macros.every(m => known.includes(m)), macros.join(' '));
  for (const p of ['uap', 'desktop4', 'desktop5', 'com', 'rescap']) assert.match(xml, new RegExp(`xmlns:${p}="`));
});
test('the pictures in build/appx', () => {
  const A = f => path.join(ROOT, 'build', 'appx', f);
  assert.deepEqual(pngSize(A('StoreLogo.png')), [50, 50]); assert.deepEqual(pngSize(A('Square44x44Logo.png')), [44, 44]);
  assert.deepEqual(pngSize(A('Square150x150Logo.png')), [150, 150]); assert.deepEqual(pngSize(A('Wide310x150Logo.png')), [310, 150]);
  assert.deepEqual(pngSize(A('PdfFile.png')), [256, 256]);
});
test('pnpm run dist:store, and dist-store/ never committed', () => {
  assert.match(pkg.scripts['dist:store'] || '', /^node scripts\/check-notes\.js && node scripts\/build-explorer-menu\.js && electron-builder --win appx --publish never --config build\/store\.config\.js$/);
  assert.ok(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim()).includes('dist-store/'));
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/store-config.test.js"`
Expected: FAIL (`Cannot find module …/scripts/store-config.js`, no manifest, no pictures).

- [ ] **Step 3: Create `scripts/store-config.js`**

```js
// The electron-builder config of the Microsoft Store package, made from the installer's own (package.json "build"): no
// update key inside (anyone can download a Store package and open it, and the Store updates this copy), the menu DLL
// without its sparse package (the package manifest has the menu: build/store-manifest.xml), the appx target, into
// dist-store\. build/store.config.js hands it the identity. No Electron here.
const NOT_IN_STORE = Object.freeze(['update-config.json']);

// id: { identityName, publisher, publisherDisplayName } (store.js); storeJson: carry store.json (its Store ID, for
// Check for Updates; a sideloaded test package has none)
function storeBuildConfig({ base, id, storeJson }) {
  return {
    ...base,
    directories: { ...(base.directories || {}), output: 'dist-store' },
    files: [...base.files.filter(f => !NOT_IN_STORE.includes(f)), ...(storeJson ? ['store.json'] : [])],
    extraResources: [{ from: 'explorer-menu/out', to: 'explorer-menu', filter: ['SastraMenu.dll'] }],
    win: { ...base.win, target: 'appx' },
    publish: null,   // no app-update.yml: the Store updates this copy
    appx: {
      identityName: id.identityName, publisher: id.publisher, publisherDisplayName: id.publisherDisplayName,
      applicationId: 'SastraPDF', displayName: 'Sastra PDF', backgroundColor: 'transparent', languages: ['en-US'],
      minVersion: '10.0.19041.0', maxVersionTested: '10.0.26100.0',   // the menu's FileExplorerContextMenus needs 2004+
      customManifestPath: 'build/store-manifest.xml',
      artifactName: 'Sastra-PDF-Store-${version}.msix'   // electron-builder's ext is appx: the same format, under its newer name
    }
  };
}

module.exports = { NOT_IN_STORE, storeBuildConfig };
```

- [ ] **Step 4: Create `build/store.config.js`**

```js
// electron-builder loads this for the Microsoft Store package: `pnpm run dist:store`, and the release job
// (.github/workflows/release.yml). The rules: scripts/store-config.js. The identity is store.json (Partner Center ›
// Product identity, docs/updates-setup.md section 7); SASTRA_STORE_SIDELOAD=1 makes the unsigned test package for this
// PC instead (store.js SIDELOAD).
const path = require('path');
const store = require('../store');
const { storeBuildConfig } = require('../scripts/store-config');

const sideload = process.env.SASTRA_STORE_SIDELOAD === '1';
const id = sideload ? store.SIDELOAD : store.readStoreInfo(path.join(__dirname, '..', 'store.json'));
if (!id) throw new Error('store.json is missing or not valid: put Partner Center › Product identity in it (docs/updates-setup.md section 7), or set SASTRA_STORE_SIDELOAD=1 for a test package');

module.exports = storeBuildConfig({ base: require('../package.json').build, id, storeJson: !sideload });
```

- [ ] **Step 5: Create `build/store-manifest.xml`** (electron-builder fills each dollar-brace macro; no other macro may appear, not even in a comment)

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Sastra PDF - the Microsoft Store package's manifest (build/store.config.js; electron-builder fills in its macros).
     electron-builder's own template, plus: the .pdf file type (Sastra PDF in "Open with"; Windows never makes a packaged
     app the default by itself), and the File Explorer menu on PDFs and pictures - the same SastraMenu.dll, CLSID and
     file types as explorer-menu/AppxManifest.xml (scripts/menu-sources.js checks), from inside this package (no sparse
     package and no HKCU keys). menu.cpp finds Sastra PDF.exe two folders above the DLL: app\Sastra PDF.exe. -->
<Package
   xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
   xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
   xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
   xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
   xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
   xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
   IgnorableNamespaces="uap desktop4 desktop5 com rescap">
  <!-- single quotes around Publisher: its value may hold double quotes -->
  <Identity Name="${identityName}" ProcessorArchitecture="${arch}" Publisher='${publisher}' Version="${version}" />
  <Properties>
    <DisplayName>${displayName}</DisplayName>
    <PublisherDisplayName>${publisherDisplayName}</PublisherDisplayName>
    <Description>${description}</Description>
    <Logo>${logo}</Logo>
  </Properties>
  <Resources>
    ${resourceLanguages}
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${minVersion}" MaxVersionTested="${maxVersionTested}" />
  </Dependencies>
  ${capabilities}
  <Applications>
    <Application Id="${applicationId}" Executable="${executable}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements BackgroundColor="${backgroundColor}" DisplayName="${displayName}" Description="${description}"
        Square150x150Logo="${square150x150Logo}" Square44x44Logo="${square44x44Logo}" />
      <Extensions>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="pdf">
            <uap:DisplayName>PDF document</uap:DisplayName>
            <uap:Logo>assets\PdfFile.png</uap:Logo>
            <uap:SupportedFileTypes><uap:FileType>.pdf</uap:FileType></uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type=".pdf">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jpg">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jpeg">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".jfif">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".png">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".bmp">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".gif">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
            <desktop5:ItemType Type=".webp">
              <desktop5:Verb Id="SastraPDF" Clsid="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
        <com:Extension Category="windows.comServer">
          <com:ComServer>
            <com:SurrogateServer DisplayName="Sastra PDF Explorer menu">
              <com:Class Id="47a2af3d-bd25-4ebd-949f-d0e6b6bd5004" Path="app\resources\explorer-menu\SastraMenu.dll" ThreadingModel="STA" />
            </com:SurrogateServer>
          </com:ComServer>
        </com:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
```

- [ ] **Step 6: The pictures.** The three square logos are the menu package's own (explorer-menu/Assets: the same logo, cut from the root original with one resample each), copied as they are; the wide tile puts the 150 px logo in the middle of a transparent 310 × 150 (no resample); PdfFile.png is the .pdf file icon at 256 px, made from the 1024 px cut-out master build/pdf-file.png with a high-quality bicubic resize (the spec's "one resample from the root original" would need the cut-out redone; the 1024 px master is 4× the target, so the result is the same to the eye). Run in PowerShell:

```powershell
$a = 'E:\_httdocs\SastraPDF\build\appx'; New-Item -ItemType Directory -Force $a | Out-Null
foreach ($f in 'StoreLogo.png','Square44x44Logo.png','Square150x150Logo.png') { Copy-Item "E:\_httdocs\SastraPDF\explorer-menu\Assets\$f" "$a\$f" }
Add-Type -AssemblyName System.Drawing
$argb = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$s = [System.Drawing.Image]::FromFile("$a\Square150x150Logo.png")
$b = New-Object System.Drawing.Bitmap 310, 150, $argb
$g = [System.Drawing.Graphics]::FromImage($b); $g.DrawImage($s, (New-Object System.Drawing.Rectangle 80, 0, 150, 150)); $g.Dispose(); $s.Dispose()
$b.Save("$a\Wide310x150Logo.png", [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
$s = [System.Drawing.Image]::FromFile('E:\_httdocs\SastraPDF\build\pdf-file.png')
$b = New-Object System.Drawing.Bitmap 256, 256, $argb
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
$wrap = New-Object System.Drawing.Imaging.ImageAttributes; $wrap.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
$g.DrawImage($s, (New-Object System.Drawing.Rectangle 0, 0, 256, 256), 0, 0, $s.Width, $s.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrap)
$g.Dispose(); $s.Dispose(); $b.Save("$a\PdfFile.png", [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
Get-ChildItem $a | Select-Object Name, Length
```

Expected: five files. Open `build\appx\PdfFile.png` and `Wide310x150Logo.png` with the Read tool and look at them: the file icon whole and sharp, no grey fringe; the logo centred on the wide tile.

- [ ] **Step 7: The script and the ignore line.** In `package.json` `scripts`, after the `"dist:portable"` line add (and put a comma after the `dist:portable` line):

```json
    "dist:store": "node scripts/check-notes.js && node scripts/build-explorer-menu.js && electron-builder --win appx --publish never --config build/store.config.js"
```

In `.gitignore`, after the `dist/` line add:

```
dist-store/
```

- [ ] **Step 8: Run it — it passes**

Run: `node --test "$T/unit/store-config.test.js"` → `# pass 5`, `# fail 0`.

- [ ] **Step 9: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add scripts/store-config.js build/store.config.js build/store-manifest.xml build/appx package.json .gitignore && git commit -m "build: the Microsoft Store package's config, manifest (.pdf, right-click menu) and logos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: scripts/menu-sources.js — the three menu declarations agree (the build checks)

**Files:**
- Create: `scripts/menu-sources.js`
- Modify: `scripts/build-explorer-menu.js:12-21` (the checks move into menu-sources.js)
- Test: `$T/unit/menu-sources.test.js`

**Interfaces:**
- Consumes: explorer-menu.js `CLSID`, `PKG`, `PKG_VERSION`, `EXTS`; Task 5 `build/store-manifest.xml`.
- Produces: `menuProblems({ cpp, sparse, store, CLSID, PKG, PKG_VERSION, EXTS }) → string[]` (empty = good).

- [ ] **Step 1: Write the failing test** — `$T/unit/menu-sources.test.js`:

```js
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = 'E:/_httdocs/SastraPDF';
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const args = () => ({ cpp: read('explorer-menu', 'menu.cpp'), sparse: read('explorer-menu', 'AppxManifest.xml'), store: read('build', 'store-manifest.xml'), ...require(ROOT + '/explorer-menu.js') });

test('the repository\'s DLL and both manifests agree', () => {
  assert.deepEqual(require(ROOT + '/scripts/menu-sources.js').menuProblems(args()), []);
});
test('a Store manifest that misses a file type, or points at another DLL, is refused', () => {
  const { menuProblems } = require(ROOT + '/scripts/menu-sources.js');
  const a = args();
  const noWebp = a.store.replace(/\s*<desktop5:ItemType Type="\.webp">[\s\S]*?<\/desktop5:ItemType>/, '');
  assert.match(menuProblems({ ...a, store: noWebp }).join('\n'), /build\/store-manifest\.xml needs one ItemType per file type/);
  assert.match(menuProblems({ ...a, store: a.store.replace('app\\resources', 'resources') }).join('\n'), /build\/store-manifest\.xml's COM class/);
  assert.match(menuProblems({ ...a, sparse: a.sparse.replace('Version="1.1.0.0"', 'Version="9.0.0.0"') }).join('\n'), /must be SastraPDF\.ExplorerMenu 1\.1\.0\.0/);
  assert.match(menuProblems({ ...a, cpp: a.cpp.replace('L".webp"', 'L".xyz"') }).join('\n'), /menu\.cpp does not handle \.webp/);
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/menu-sources.test.js"` → FAIL (`Cannot find module …/scripts/menu-sources.js`).

- [ ] **Step 3: Create `scripts/menu-sources.js`**

```js
// The right-click menu is declared in three places that must agree with explorer-menu.js — menu.cpp (the DLL),
// explorer-menu/AppxManifest.xml (the installer's sparse package) and build/store-manifest.xml (the Microsoft Store
// package): the same CLSID, the same file types, each manifest's DLL path, the sparse package's name and version.
// Nothing is built here; scripts/build-explorer-menu.js stops on the first problem.
const MANIFESTS = [
  ['explorer-menu/AppxManifest.xml', 'sparse', 'resources\\explorer-menu\\SastraMenu.dll'],
  ['build/store-manifest.xml', 'store', 'app\\resources\\explorer-menu\\SastraMenu.dll']
];

// → the problems, in plain words (none = good)
function menuProblems({ cpp, sparse, store, CLSID, PKG, PKG_VERSION, EXTS }) {
  const id = CLSID.slice(1, -1).toLowerCase(), xmls = { sparse, store }, problems = [];
  if (!cpp.toLowerCase().includes(`uuid("${id}")`)) problems.push(`menu.cpp does not use ${CLSID}`);
  for (const e of EXTS) if (!cpp.includes(`L"${e}"`)) problems.push(`menu.cpp does not handle ${e}`);
  for (const [name, key, dll] of MANIFESTS) {
    const xml = xmls[key];
    const types = [...xml.matchAll(/<desktop5:ItemType Type="([^"]+)">\s*<desktop5:Verb Id="SastraPDF" Clsid="([^"]+)" \/>/g)];
    if (types.map(t => t[1]).join(' ') !== EXTS.join(' ') || types.some(t => t[2].toLowerCase() !== id))
      problems.push(`${name} needs one ItemType per file type (${EXTS.join(' ')}), each with ${CLSID}`);
    if (!xml.toLowerCase().includes(`<com:class id="${id}" path="${dll.toLowerCase()}"`)) problems.push(`${name}'s COM class must be ${CLSID} at ${dll}`);
  }
  if (!sparse.includes(`Name="${PKG}"`) || !sparse.includes(`Version="${PKG_VERSION}"`)) problems.push(`explorer-menu/AppxManifest.xml must be ${PKG} ${PKG_VERSION}`);
  return problems;
}

module.exports = { menuProblems };
```

- [ ] **Step 4: Use it in the build script.** In `scripts/build-explorer-menu.js` replace lines 12–21 (from `// CLSID, package version and file types must be the same…` through the `if (!xml.includes(\`Name="${PKG}"\`) …` line) with:

```js
// CLSID, package version and file types must be the same in the DLL, both manifests and explorer-menu.js
const { CLSID, PKG, PKG_VERSION, EXTS } = require('../explorer-menu.js');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const problems = require('./menu-sources').menuProblems({ cpp: read('explorer-menu', 'menu.cpp'), sparse: read('explorer-menu', 'AppxManifest.xml'),
  store: read('build', 'store-manifest.xml'), CLSID, PKG, PKG_VERSION, EXTS });
if (problems.length) fail(problems[0]);
```

- [ ] **Step 5: Run it — it passes, and the build still runs**

Run: `node --test "$T/unit/menu-sources.test.js"` → `# pass 2`.
Run: `unset ELECTRON_RUN_AS_NODE; cd /e/_httdocs/SastraPDF && pnpm run build:menu` → `build-explorer-menu: explorer-menu\out\SastraMenu.dll and SastraPDF.ExplorerMenu.msix ready`.

- [ ] **Step 6: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add scripts/menu-sources.js scripts/build-explorer-menu.js && git commit -m "build: the menu build checks the Store manifest too (scripts/menu-sources.js)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: scripts/store-check.js — the built package has the menu and store.js, and no key

**Files:**
- Create: `scripts/store-check.js`
- Test: `$T/unit/store-check.test.js`

**Interfaces:**
- Consumes: Task 5's output layout (`<dist>/<msix>`, `<dist>/win-unpacked/resources/…`).
- Produces: `asarFiles(file) → string[]`; `storeProblems(dist, msix) → string[]`; CLI `node scripts/store-check.js <dist-store> <msix name>` (exit 1 with `::error::` lines, else exit 0 with one `store-check: …` line).

- [ ] **Step 1: Write the failing test** — `$T/unit/store-check.test.js`:

```js
// scripts/store-check.js on made-up build folders (nothing is built here).
const test = require('node:test'), assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = 'E:/_httdocs/SastraPDF', MSIX = 'Sastra-PDF-Store-9.9.9.msix';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sastra-storecheck-'));
// an app.asar with these (empty) files: the 16-byte pickle head, then the JSON header (as Electron writes it)
function fakeAsar(file, names) {
  const files = {};
  for (const n of names) { let node = files; const parts = n.split('/'); for (const p of parts.slice(0, -1)) node = (node[p] = node[p] || { files: {} }).files; node[parts.at(-1)] = { size: 0, offset: '0' }; }
  const json = Buffer.from(JSON.stringify({ files }));
  const head = Buffer.alloc(16); head.writeUInt32LE(4, 0); head.writeUInt32LE(json.length + 8, 4); head.writeUInt32LE(json.length + 4, 8); head.writeUInt32LE(json.length, 12);
  fs.writeFileSync(file, Buffer.concat([head, json]));
}
let k = 0;
function make({ key = false, keyBeside = false, storeJs = true, dll = true, sparse = false, updateYml = false, msix = true } = {}) {
  const dist = path.join(tmp, 'dist' + (++k)), res = path.join(dist, 'win-unpacked', 'resources');
  fs.mkdirSync(path.join(res, 'explorer-menu'), { recursive: true });
  fakeAsar(path.join(res, 'app.asar'), ['main.js', ...(storeJs ? ['store.js'] : []), 'app/index.html', ...(key ? ['update-config.json'] : [])]);
  if (keyBeside) { fs.mkdirSync(path.join(res, 'app'), { recursive: true }); fs.writeFileSync(path.join(res, 'app', 'update-config.json'), '{}'); }
  if (dll) fs.writeFileSync(path.join(res, 'explorer-menu', 'SastraMenu.dll'), 'x');   // text stand-ins: never PE bytes on disk
  if (sparse) fs.writeFileSync(path.join(res, 'explorer-menu', 'SastraPDF.ExplorerMenu.msix'), 'x');
  if (updateYml) fs.writeFileSync(path.join(res, 'app-update.yml'), 'url: x');
  if (msix) fs.writeFileSync(path.join(dist, MSIX), 'x');
  return dist;
}

test('a good package passes; each missing or forbidden part is one problem', () => {
  const { asarFiles, storeProblems } = require(ROOT + '/scripts/store-check.js');
  const good = make();
  assert.deepEqual(asarFiles(path.join(good, 'win-unpacked', 'resources', 'app.asar')), ['main.js', 'store.js', 'app/index.html']);
  assert.deepEqual(storeProblems(good, MSIX), []);
  for (const o of [{ key: true }, { keyBeside: true }, { storeJs: false }, { dll: false }, { sparse: true }, { updateYml: true }, { msix: false }])
    assert.equal(storeProblems(make(o), MSIX).length, 1, JSON.stringify(o));
});
test('as the release runs it: 0 for a good package, 1 with an ::error:: line for a bad one', () => {
  const cli = dist => spawnSync(process.execPath, [ROOT + '/scripts/store-check.js', dist, MSIX], { encoding: 'utf8' });
  const ok = cli(make()), bad = cli(make({ key: true }));
  assert.equal(ok.status, 0); assert.match(ok.stdout, /^store-check: /m);
  assert.equal(bad.status, 1); assert.match(bad.stderr, /::error::.*update key/);
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/store-check.test.js"` → FAIL (`Cannot find module …/scripts/store-check.js`).

- [ ] **Step 3: Create `scripts/store-check.js`**

```js
// After electron-builder made the Microsoft Store package (build/store.config.js): the app inside it has store.js and
// the menu DLL, and none of what only the installer may carry — the update key (anyone can download a Store package and
// open it), app-update.yml, the sparse menu package.
// `node scripts/store-check.js <dist-store> <msix name>`; run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path');

// The files in an Electron app.asar: its header is JSON after a 16-byte pickle head (the JSON's length at offset 12)
function asarFiles(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16);
    const out = [];
    const walk = (node, at) => { for (const [k, v] of Object.entries(node.files || {})) { const p = at ? at + '/' + k : k; if (v.files) walk(v, p); else out.push(p); } };
    walk(JSON.parse(json.toString('utf8')), '');
    return out;
  } finally { fs.closeSync(fd); }
}

// → the problems, in plain words (none = good)
function storeProblems(dist, msix) {
  const res = path.join(dist, 'win-unpacked', 'resources'), there = (...p) => fs.existsSync(path.join(...p)), problems = [];
  if (!there(dist, msix)) problems.push(`there is no ${msix}`);
  if (!there(res, 'explorer-menu', 'SastraMenu.dll')) problems.push('the menu DLL is not inside (resources/explorer-menu/SastraMenu.dll)');
  if (there(res, 'explorer-menu', 'SastraPDF.ExplorerMenu.msix')) problems.push('the sparse menu package is inside (the Store package has its own menu)');
  if (there(res, 'app-update.yml')) problems.push('app-update.yml is inside (the Store updates this copy)');
  let files = [];
  try { files = asarFiles(path.join(res, 'app.asar')); } catch (e) { problems.push('app.asar could not be read: ' + e.message); }
  if (files.length && !files.includes('store.js')) problems.push('store.js is not inside (main.js needs it)');
  if (files.includes('update-config.json') || there(res, 'app', 'update-config.json')) problems.push('the update key (update-config.json) is inside');
  return problems;
}

if (require.main === module) {
  const [dist, msix] = process.argv.slice(2);
  if (!dist || !msix) { console.error('Usage: node scripts/store-check.js <dist-store> <msix name>'); process.exit(2); }
  const problems = storeProblems(path.resolve(dist), msix);
  for (const p of problems) console.error('::error::Store package: ' + p);
  if (problems.length) process.exit(1);
  console.log(`store-check: ${msix} has the menu and store.js, and no update key`);
}

module.exports = { asarFiles, storeProblems };
```

- [ ] **Step 4: Run it — it passes**

Run: `node --test "$T/unit/store-check.test.js"` → `# pass 2`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add scripts/store-check.js && git commit -m "build: scripts/store-check.js — the Store package has the menu, and no update key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: the release job (1.2.0) also makes the Store package and attaches it to the GitHub release

**Files:**
- Modify: `.github/workflows/release.yml` (header comment; build job `env`; the first check step; new steps after "The build has the installer…"; a second upload-artifact; the GitHub release step)
- Test: `$T/unit/release-workflow.test.js`

**Interfaces:**
- Consumes: Task 5 `build/store.config.js`, `dist-store/`; Task 7 `scripts/store-check.js`; Task 1 `store.readStoreInfo`.
- Produces: env `MSIX: Sastra-PDF-Store-${{ inputs.version }}.msix`; GitHub release asset `Sastra-PDF-Store-<version>.msix` with its SHA-256 in the notes; nothing new in R2.

- [ ] **Step 1: Write the failing test** — `$T/unit/release-workflow.test.js`:

```js
// .github/workflows/release.yml read as text: the steps' order, what each may touch, and every run block parses in bash.
const test = require('node:test'), assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const Y = fs.readFileSync('E:/_httdocs/SastraPDF/.github/workflows/release.yml', 'utf8').replace(/\r\n/g, '\n');
// steps as { name, text, run }: a step starts at "      - " (6 spaces); run is its "run: |" block, de-indented
const steps = Y.split(/\n(?=      - )/).slice(1).map(text => {
  const name = (/name: "?([^"\n]+)"?/.exec(text) || [])[1] || '';
  const m = /\n {8}run: \|\n((?: {10}.*\n?|\n)*)/.exec(text + '\n'), one = /\n {8}run: (?!\|)(.*)/.exec(text);
  return { name, text, run: m ? m[1].replace(/^ {10}/gm, '') : one ? one[1] : '' };
});
const step = start => steps.find(s => s.name.startsWith(start));
const at = start => steps.findIndex(s => s.name.startsWith(start));

test('every run block parses in bash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sastra-wf-'));
  for (const s of steps.filter(s => s.run)) {
    const f = path.join(dir, 'step.sh'); fs.writeFileSync(f, s.run);
    const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${s.name}: ${r.stderr}`);
  }
});
test('the Store package: store.json checked first, built after the installer without the key, checked, kept', () => {
  assert.match(Y, /^ {6}MSIX: Sastra-PDF-Store-\$\{\{ inputs\.version \}\}\.msix$/m);
  assert.match(step('The version matches package.json').run, /require\('\.\/store'\)\.readStoreInfo\('store\.json'\)/);
  const order = ['Build the installer', 'The build has the installer', 'For the Store: build the Store package', 'For the Store: the package has', 'Upload to R2'].map(at);
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
  const b = step('For the Store: build the Store package').run;
  assert.ok(b.indexOf('rm -f update-config.json') >= 0 && b.indexOf('electron-builder --win appx --publish never --config build/store.config.js') > b.indexOf('rm -f update-config.json'), b);
  assert.match(step('For the Store: the package has').run, /node scripts\/store-check\.js dist-store "\$MSIX"/);
  assert.ok(steps.some(s => /name: store\n/.test(s.text) && /path: dist-store\/\$\{\{ env\.MSIX \}\}/.test(s.text)));
});
test('the .msix goes to the GitHub release with its SHA-256, never to R2', () => {
  const g = step('GitHub release').run;
  assert.match(g, /dist-store\/\$MSIX/); assert.match(g, /sha256sum "dist-store\/\$MSIX"/);
  for (const s of ['Upload to R2', 'Remove older installers']) assert.doesNotMatch(step(s).run, /MSIX|dist-store/, s);
  for (const s of ['For the Store: build the Store package', 'For the Store: the package has']) assert.doesNotMatch(step(s).text, /secrets\.|GH_TOKEN/, s);
});
```

- [ ] **Step 2: Run it — it fails**

Run: `node --test "$T/unit/release-workflow.test.js"`
Expected: `every run block parses in bash` passes; the two Store tests FAIL.

- [ ] **Step 3: The workflow — header and env.** In `.github/workflows/release.yml`, replace the first three comment lines with:

```yaml
# Builds the Windows installer and releases it: into the private Cloudflare R2 bucket behind
# https://sastra-update.smith89k.com/ (locked with Cloudflare Access: only installed copies, which carry the update key,
# get in), and as a GitHub release with the notes from What's new (app/notes.js) — the installer to hand out. It also
# builds the Microsoft Store package (store.js, build/store.config.js: the same app with no update key) and puts it on
# the GitHub release only, never in R2: the user submits it in Partner Center, and Microsoft signs it.
```

In the build job's `env:`, after `      EXE: Sastra-PDF-Setup-${{ inputs.version }}.exe` add:

```yaml
      MSIX: Sastra-PDF-Store-${{ inputs.version }}.msix
```

- [ ] **Step 4: The workflow — store.json is checked before anything.** In the step `The version matches package.json, is not released yet, and the R2 secrets are set`, rename it to `The version matches package.json, is not released yet, store.json holds the Store identity, and the R2 secrets are set`, and after the `fi` that ends the "already released" check add:

```bash
          node -e "if (!require('./store').readStoreInfo('store.json')) { console.error('::error::store.json is missing or not valid: see docs/updates-setup.md section 7'); process.exit(1); }"
```

- [ ] **Step 5: The workflow — build and check the Store package.** After the step `The build has the installer, its blockmap and latest.yml naming it` and before `# Kept a few days on the run's page, in case R2 misbehaves.`, add:

```yaml
      # The Microsoft Store package: the same app, but the update key leaves the workspace first (the installer is built).
      - name: "For the Store: build the Store package (no update key inside)"
        run: |
          rm -f update-config.json
          pnpm exec electron-builder --win appx --publish never --config build/store.config.js

      - name: "For the Store: the package has the menu, and no update key"
        run: node scripts/store-check.js dist-store "$MSIX"
```

After the existing `installer` upload-artifact step add:

```yaml
      - uses: actions/upload-artifact@v7
        with:
          name: store
          path: dist-store/${{ env.MSIX }}
          if-no-files-found: error
          retention-days: 5
          compression-level: 0
```

- [ ] **Step 6: The workflow — the GitHub release.** In the step `GitHub release (notes from What's new)` replace the last line

```bash
          gh release create "v$VERSION" "dist/$EXE" --target "$GITHUB_SHA" --title "Sastra PDF $VERSION" --notes-file notes.md
```

with

```bash
          printf '\n%s is for the Microsoft Store: submit it in Partner Center (docs/updates-setup.md section 7). Microsoft signs it.\n\nSHA-256 of the Store package: `%s`\n' \
            "$MSIX" "$(sha256sum "dist-store/$MSIX" | cut -d' ' -f1)" >> notes.md
          gh release create "v$VERSION" "dist/$EXE" "dist-store/$MSIX" --target "$GITHUB_SHA" --title "Sastra PDF $VERSION" --notes-file notes.md
```

- [ ] **Step 7: Run it — it passes**

Run: `node --test "$T/unit/release-workflow.test.js"` → `# pass 3`, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add .github/workflows/release.yml && git commit -m "ci: the release also makes the Microsoft Store package, checks it and attaches it to the GitHub release

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: the docs — setup guide, Store listing texts, README, CLAUDE.md

**Files:**
- Modify: `docs/updates-setup.md` (new section 7 before `## Good to know`; one item in "Good to know")
- Create: `docs/store-listing.md`
- Modify: `README.md` (`## Download`, `## Code signing policy`, the privacy paragraph), `CLAUDE.md` (Project layout; a Status entry)

No test: documents. Read them once at the end.

- [ ] **Step 1: docs/updates-setup.md section 7** — before `## Good to know` add:

```markdown
## 7. The Microsoft Store

The Store version is the same Sastra PDF with no update key. Microsoft signs it, so Windows shows no warning, and the
Store keeps it up to date. Version 1.2.0 is the last one for installer copies; after Microsoft has published Sastra PDF,
releases make only the Store package.

**Once** (the developer account already exists, from Bohpum):
1. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve the name **Sastra PDF** (if it
   is taken, choose a close name — and change `displayName` in scripts/store-config.js to match).
2. Sastra PDF → **Product management** → **Product identity**. Copy four values into `store.json` at the top of the
   repository, then commit it (they are not secret):
   ```json
   {
     "identityName": "<Package/Identity/Name>",
     "publisher": "<Package/Identity/Publisher, CN=…>",
     "publisherDisplayName": "<Package/Properties/PublisherDisplayName>",
     "storeId": "<Store ID, 12 characters>"
   }
   ```
   The release refuses to run without it.
3. Put the privacy policy from `docs/store-listing.md` on a page of your website (for example
   https://smith89k.com/sastra-pdf/privacy) — Partner Center asks for its address.
4. The first submission (after the release has made the package): **Pricing and availability** (Free; markets: all),
   **Properties** (category Productivity; the privacy policy address), **Age ratings** (the questionnaire: no violence,
   no user content shared, no purchases), **Store listings** (English: description, features and keywords from
   `docs/store-listing.md`, the screenshots), **Submission options** → restricted capabilities: paste the `runFullTrust`
   text and the notes for certification from `docs/store-listing.md`.

**Each release:**
1. Release as in section 6.
2. Open the GitHub release `v<version>` and download `Sastra-PDF-Store-<version>.msix`.
3. Partner Center → Sastra PDF → **Start update** (or, the first time, the submission above) → **Packages** → drag the
   `.msix` in → wait until it says it is valid → **Submit to the Store**.
4. Microsoft checks it, usually in 1 to 3 days. Store users then get the update by themselves. If certification asks a
   question (most likely about `runFullTrust` or the right-click menu), answer it in **Notes for certification** and
   submit again.

**Trying the Store package on this PC first** (before a first submission, or after changing the manifest): in
PowerShell `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; $env:SASTRA_STORE_SIDELOAD='1'; pnpm run dist:store`,
then in an administrator PowerShell `Add-AppxPackage -Path dist-store\Sastra-PDF-Store-<version>.msix -AllowUnsigned`.
It installs as "Sastra PDF" (identity `SastraPDF.StoreTest`); remove it with
`Get-AppxPackage SastraPDF.StoreTest | Remove-AppxPackage`.
```

In `## Good to know`, after the `**Windows SmartScreen**` item add:

```markdown
- **Without the warning:** the Microsoft Store version (section 7) is signed by Microsoft. Send people the Store link
  instead of the installer.
```

- [ ] **Step 2: Create docs/store-listing.md**

```markdown
# Sastra PDF — Microsoft Store listing texts

Copy these into Partner Center (docs/updates-setup.md section 7). Written for people who find Sastra PDF in the Store.

## Description

Sastra PDF (សាស្ត្រា PDF) is a PDF tool for Windows. Open several PDFs as tabs, put pages in order, and combine, split,
rotate, delete and print them. Turn pages into pictures, and pictures into PDFs. Drag pages from one file to another, or
drop PDFs and photos straight into the page list. It reads Khmer and English documents and works offline.

Your files stay on your computer. Sastra PDF has no account, no ads and sends nothing about you or your files.

## Features

- Open many PDFs as tabs; zoom, hand tool, full-window and presentation views
- Organize pages: move, rotate, delete, insert files and pictures, drag pages between files
- Combine and split PDFs; save pages as JPG or PNG pictures
- Print with a preview: poster, several pages per sheet, booklets, both sides
- Right-click PDFs and pictures in File Explorer: Make PDF, Combine, Split, Save as images
- Khmer and English; light and dark themes; works offline

## Keywords

pdf, combine pdf, split pdf, merge, pdf pages, image to pdf, khmer

## Privacy policy

Sastra PDF does not collect, store or send any personal information. Your PDFs and pictures stay on your computer and
are never uploaded. Sastra PDF has no account, no analytics and no ads, and its fonts are inside the app. The Microsoft
Store version makes no internet requests of its own; updates come from the Microsoft Store.
Questions: https://smith89k.com

## Restricted capability: runFullTrust

Sastra PDF is a classic desktop app (Electron). It needs full trust to open and save PDF files the user picks anywhere
on the PC, to save several files into a folder the user picks, to print, and to add "Sastra PDF" (Make PDF, Combine,
Split, Images) to the File Explorer menu for PDF files and pictures.

## Notes for certification

To try it: open any PDF with Sastra PDF (☰ › File › Open, or right-click a PDF › Open with › Sastra PDF). In File
Explorer, select a PDF or a picture and right-click › Sastra PDF to see the menu (it acts only on the selected files and
asks before replacing any file). The app makes no network requests.
```

- [ ] **Step 3: README.** Replace the whole `## Download` section with:

```markdown
## Download
Sastra PDF is in the Microsoft Store (Windows 10 or 11, 64-bit), signed by Microsoft: open the Microsoft Store app and
search for **Sastra PDF**. The Store keeps it up to date. Version 1.2.0 was the last one given out as an installer;
those copies keep working but update no further — install the Store version, then uninstall the old one.
Releasing: [docs/updates-setup.md](docs/updates-setup.md).
```

Replace the whole `## Code signing policy` section (down to, not including, `## Licence`) with:

```markdown
## Signing and privacy
The Microsoft Store version is signed by Microsoft. Installers up to 1.2.0 are unsigned, so Windows SmartScreen may
warn about them: "More info" > "Run anyway".

**Privacy policy:** Sastra PDF sends nothing about you or your files anywhere. Your PDFs stay on your computer; the app
has no telemetry and no online fonts. The Store version makes no internet requests of its own (the Store updates it).
Copies installed from an installer up to 1.2.0 check https://sastra-update.smith89k.com/ for a newer version when they
start and every 6 hours; those requests carry nothing about you or your files.
```

- [ ] **Step 4: CLAUDE.md.** In `## Project layout`, after the `updater.js` entry add:

```text
    store.js           The Microsoft Store copy's rules, no Electron inside: `isStoreCopy` (process.windowsStore, or
                       SASTRA_STORE_TEST=1 from source), `readStoreInfo` (store.json = Partner Center identity),
                       `SIDELOAD` (unsigned test identity SastraPDF.StoreTest), `storePageUrl`. In the Store copy main.js
                       never updates, never sets up/repairs the menu (`--explorer-menu=` exits 0), Check for Updates opens
                       the Store, and userData is "Sastra PDF Store" (own single-instance lock)
    store.json         Partner Center › Product identity (committed, not secret); the release refuses without it
    build/store.config.js + scripts/store-config.js  electron-builder config of the Store package (`pnpm run dist:store`,
                       SASTRA_STORE_SIDELOAD=1 = test package): appx into dist-store/, no update-config.json, only
                       SastraMenu.dll, custom manifest build/store-manifest.xml (.pdf "Open with", the menu on EXTS, the
                       DLL at app\resources\explorer-menu), logos in build/appx/
    scripts/menu-sources.js  menu.cpp, the sparse manifest and the Store manifest agree (build-explorer-menu.js runs it)
    scripts/store-check.js   the built Store package has the DLL and store.js, and no key / app-update.yml / sparse .msix
```

Add a Status entry at the end of `## Status` (fill the facts the work produced: what passed, the test package result on this PC, commits):

```markdown
- **Microsoft Store work (2026-10-19 →)**: plan docs/superpowers/plans/2026-10-19-microsoft-store.md. menu.cpp starts the
  app directly when its DLL runs inside the Store package (`InStorePackage`), so the app runs in that package too.
```

- [ ] **Step 5: Read the four documents once** and fix anything that doesn't match what Tasks 1–8 built (names, paths, commands).

- [ ] **Step 6: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add docs/updates-setup.md docs/store-listing.md README.md CLAUDE.md && git commit -m "docs: the Microsoft Store setup and each release's upload, the Store listing texts, README, CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: try the Store package on this PC ("check local first" — needs the user's yes)

**Files:** none changed, unless a problem is found: then fix it in the file it belongs to (use superpowers:systematic-debugging), add a check to that file's test, commit.

- [ ] **Step 1: Run every suite.** `for f in "$T"/unit/*.test.js; do node --test "$f" | grep -E "^# (pass|fail)"; done`, `cd "$T" && node store-wiring-test.js | tail -1`, `cd "$T" && node drop-test.js | tail -1`. Expected: all pass.

- [ ] **Step 2: Ask the user** — "May I build a test copy of the Store version on this PC and install it? It takes a few minutes, and Windows will ask once for permission." Wait for yes.

- [ ] **Step 3: Build the test package** (PowerShell):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:SASTRA_STORE_SIDELOAD = '1'; pnpm run dist:store; Remove-Item Env:SASTRA_STORE_SIDELOAD
$v = node -p "require('./package.json').version"
node scripts/store-check.js dist-store "Sastra-PDF-Store-$v.msix"
```

Expected: `dist-store\Sastra-PDF-Store-<version>.msix`; `store-check: … has the menu and store.js, and no update key`. (EPERM on a `.tmp` folder: delete it and run again — CLAUDE.md gotchas.)

- [ ] **Step 4: Install it** (UAC asks once; the user clicks Yes):

```powershell
$p = (Resolve-Path "dist-store\Sastra-PDF-Store-$v.msix").Path
Start-Process pwsh -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', "Add-AppxPackage -Path '$p' -AllowUnsigned; if (-not `$?) { Read-Host 'Failed - press Enter' }"
Get-AppxPackage SastraPDF.StoreTest | Select-Object Name, Version, InstallLocation, Status
```

Expected: `SastraPDF.StoreTest`, version `<version>.0`, Status `Ok`; Start menu has **Sastra PDF**.

- [ ] **Step 5: Check by hand, with the user** (close the user's own Sastra PDF first). Make test files with no real documents: copy `$T/drop/A.pdf`, `B.pdf`, `2.jpg`, `10.png` (from the drop-into-pages tests) into a new folder `E:\StoreTest`.
  1. Start Sastra PDF from the Start menu → What's new opens; About shows the version.
  2. ☰ › Help › Check for Updates → the Store app opens on Downloads and updates; no box stays in Sastra.
  3. File Explorer → `E:\StoreTest\A.pdf` → right-click › Open with › Sastra PDF → it opens.
  4. First Windows 11 menu on `2.jpg` → Sastra PDF › Make PDF; on `A.pdf` + `10.png` → Combine; on `A.pdf` → Split here and Images here. Each works. (The installed 1.1.2 has its own Sastra PDF entry too: use the Store one — if both show, check which ran with the PowerShell line in item 5.)
  5. While a Combine result is open: `Get-CimInstance Win32_Process -Filter "name='Sastra PDF.exe'" | Select-Object ExecutablePath` shows a path under `C:\Program Files\WindowsApps\SastraPDF.StoreTest_…`, and ☰ › Help › Check for Updates in that window opens the Store (it runs inside the package). If not: the menu job did not reach the packaged app — debug menu.cpp `InStorePackage` / `DirectLaunch` before anything else.
  6. Print preview opens (☰ › File › Print…), Close.
  7. Start the installed 1.1.2 copy (Start menu entry from the installer, or `%LOCALAPPDATA%\Programs\Sastra PDF\Sastra PDF.exe`) while the Store copy is open → two separate windows, each keeps its own files. If the second hands its files to the first instead, debug the userData rename in main.js.

- [ ] **Step 6: Microsoft's checker** (administrator PowerShell, UAC once more):

```powershell
Start-Process pwsh -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', "& 'C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe' test -appxpackagepath '$p' -reportoutputpath '$env:TEMP\sastra-wack.xml'"
Select-String -Path "$env:TEMP\sastra-wack.xml" -Pattern 'OVERALL_RESULT'
```

Expected: `OVERALL_RESULT="PASS"` (or only warnings). A FAIL: read that test's name in the report, fix, rebuild from Step 3 (ask again first).

- [ ] **Step 7: Remove the test package**

```powershell
Get-AppxPackage SastraPDF.StoreTest | Remove-AppxPackage
```

- [ ] **Step 8: Tell the user what passed**, and anything fixed on the way (with its commit). Record the results in CLAUDE.md's Status entry from Task 9 and commit.

---

### Task 11: Partner Center, store.json, screenshots (needs the user's values)

**Files:**
- Create: `store.json`
- Create (outside the repo): `$T/store-shots.js`, `$T/shots-store/*.png`

- [ ] **Step 1: Guide the user through docs/updates-setup.md section 7 "Once", steps 1–3**, one step at a time in plain words. Get the four Product identity values from them (Package/Identity/Name, Package/Identity/Publisher, Package/Properties/PublisherDisplayName, Store ID). Never guess or invent them.

- [ ] **Step 2: Write `store.json`** at the top of the repository with the user's values:

```json
{
  "identityName": "<Package/Identity/Name from the user>",
  "publisher": "<Package/Identity/Publisher from the user>",
  "publisherDisplayName": "<Package/Properties/PublisherDisplayName from the user>",
  "storeId": "<Store ID from the user>"
}
```

- [ ] **Step 3: Check it**

Run: `node --test "$T/unit/store.test.js" "$T/unit/store-config.test.js"` and `cd "$T" && node store-wiring-test.js` (it now expects the `ms-windows-store://pdp/?ProductId=<id>` link).
Expected: all pass; `node -e "console.log(require('E:/_httdocs/SastraPDF/store').readStoreInfo('E:/_httdocs/SastraPDF/store.json'))"` prints the four values.

- [ ] **Step 4: Commit** (no push yet)

```bash
cd /e/_httdocs/SastraPDF && git add store.json && git commit -m "chore: store.json — Sastra PDF's Microsoft Store identity from Partner Center

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Screenshots from a made-up PDF** (never the user's documents) — `$T/store-shots.js`:

```js
// Store screenshots: Sastra PDF with a made-up 6-page PDF, light and dark, the Pages panel and the Print screen.
const { _electron } = require('playwright-core');
const fs = require('fs'), path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('E:/_httdocs/SastraPDF/node_modules/pdf-lib');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, OUT = path.join(T, 'shots-store'), UD = path.join(T, 'ud-shots');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT); fs.rmSync(UD, { recursive: true, force: true });
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const titles = ['Annual Report 2026', 'Highlights', 'Projects', 'Budget', 'Team', 'Next Year'];
  titles.forEach((t, i) => {
    const p = doc.addPage([595, 842]);
    p.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(.8, .13, .16) });
    p.drawText(t, { x: 48, y: 790, size: 28, font: bold, color: rgb(1, 1, 1) });
    for (let k = 0; k < 18; k++) p.drawRectangle({ x: 48, y: 700 - k * 30, width: 499 - (k % 4) * 60, height: 10, color: rgb(.82, .82, .82) });
    p.drawRectangle({ x: 48, y: 90, width: 220, height: 110, color: rgb(.98, .86, .87) });
    p.drawText(`Page ${i + 1}`, { x: 48, y: 40, size: 12, font, color: rgb(.4, .4, .4) });
  });
  const pdf = path.join(T, 'Annual Report 2026.pdf'); fs.writeFileSync(pdf, await doc.save());
  const app = await _electron.launch({ executablePath: path.join(APP, 'node_modules/electron/dist/electron.exe'), args: [APP, '--user-data-dir=' + UD, pdf], env });
  const page = await app.firstWindow(); await require('./notes-skip')(page);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1600, 900); w.center(); });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, '1-light.png') });
  await page.evaluate(() => document.querySelector('#bTheme').click()); await page.evaluate(() => document.querySelector('#bTheme').click()); await sleep(800);   // System → Light → Dark
  await page.screenshot({ path: path.join(OUT, '2-dark.png') });
  await page.evaluate(() => document.querySelector('#bTheme').click()); await sleep(500);   // back to System
  await page.keyboard.press('Control+p'); await sleep(3000);
  await page.screenshot({ path: path.join(OUT, '3-print.png') });
  await app.close();
  console.log('shots in', OUT);
})();
```

Run: `cd "$T" && node store-shots.js`. Look at each PNG with the Read tool (at least 1366 × 768 px — the window's content is 1600 × 900 CSS px, more on a scaled screen; the Store takes up to 3840 × 2160). Retake any that shows a toast or a half-drawn page. Tell the user where they are (full paths).

- [ ] **Step 6: The privacy page.** Give the user the "Privacy policy" text from docs/store-listing.md to put on smith89k.com (e.g. https://smith89k.com/sastra-pdf/privacy). Wait until they say it is up; open the address to check it shows the text.

---

### Task 12: release 1.2.0 (both files), then submit (each step needs the user's yes)

**Files:**
- Modify: `package.json` (version), `app/notes.js` (the 1.2.0 entry at the top of `NOTES`), `CLAUDE.md` (Status), `docs/HISTORY.md` (a section on the Store)

- [ ] **Step 1: Bump the version**

```bash
cd /e/_httdocs/SastraPDF && pnpm version 1.2.0 --no-git-tag-version --no-git-checks
```

- [ ] **Step 2: What's new 1.2.0.** In `app/notes.js`, at the top of `NOTES` (before `N('1.1.2', …`), add — with the release day's date, and the Store ID from store.json in the address:

```js
  N('1.2.0', '<release day, YYYY-MM-DD>', [
    ['new', 'Sastra PDF is now in the Microsoft Store, signed by Microsoft, so Windows no longer warns when you install it. New versions now come only from the Store. If you installed Sastra PDF from an installer: open the Microsoft Store app, search for Sastra PDF (or go to apps.microsoft.com/detail/<storeId from store.json>), install it, then uninstall this copy in Settings › Apps. The Store version starts with fresh settings.'],
    ['new', 'Drag PDFs and pictures from File Explorer onto the Pages panel to add them where the red line shows. Pictures keep their own size. One Ctrl+Z takes it all back.'],
    ['new', 'Drag pages onto another open file\'s tab to copy them there. Hold them over the tab for half a second to open it, then drop them where you want. Inside one file, hold Ctrl while you drop to copy pages instead of moving them.'],
    ['improved', 'Insert file (Organize pages) now takes pictures too, in name order.']
  ]),
```

Run: `node scripts/check-notes.js` → no error.

- [ ] **Step 3: Run every suite** (as Task 10 Step 1, plus `cd "$OLD" && for s in controls-test pages-panel-test titlebar-test close-test images-test print-screen-test whats-new-test; do echo "== $s"; node $s.js | tail -1; done` — copy `pdfs/ten.pdf` to `out/ten.pdf` first). All must pass.

- [ ] **Step 4: Commit, then ask before pushing**

```bash
cd /e/_httdocs/SastraPDF && git add package.json app/notes.js && git commit -m "1.2.0: What's new — the Microsoft Store, drop into the Pages panel, move pages between files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Ask: "Push main to GitHub?" On yes: `git fetch && git status -sb` (GitHub may be ahead: stop and tell the user if so), then `git push origin main`.

- [ ] **Step 5: Ask before releasing.** "Release 1.2.0 now? It makes the installer (installed copies update to it within hours) and the Store package." On yes: `gh workflow run release.yml -f version=1.2.0`, then watch it: `gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')`. Expected: every step passes; the log shows `Locked (without the key: HTTP 403); with the key: version 1.2.0` and `store-check: Sastra-PDF-Store-1.2.0.msix has the menu and store.js, and no update key`.

- [ ] **Step 6: Check the release.** `gh release view v1.2.0` lists `Sastra-PDF-Setup-1.2.0.exe` and `Sastra-PDF-Store-1.2.0.msix`, and the notes end with both SHA-256 lines. Download the .msix into the scratchpad and run Microsoft's checker on it as in Task 10 Step 6 (it can't be installed here: unsigned, real identity).

- [ ] **Step 7: The first submission.** Tell the user, in plain steps: download `Sastra-PDF-Store-1.2.0.msix` from the GitHub release, then follow docs/updates-setup.md section 7 "Once" step 4 with the texts in docs/store-listing.md and the screenshots from Task 11 (give their full paths). Submit the same day (installer copies get 1.2.0 within hours; the Store page goes live 1–3 days later).

- [ ] **Step 8: Docs.** Add the release facts to CLAUDE.md Status (run number, sizes, SHA-256s, submission day) and a `### 35. Sastra PDF in the Microsoft Store (Claude Code, <date>)` section to docs/HISTORY.md in the style of section 33, commit, and ask before pushing.

---

### Task 13: after Microsoft has published Sastra PDF — Store-only releases

Only when the user says the Store page is live (its address opens and shows Sastra PDF). If certification asked for a fix before publishing, that fix is released with Task 12's workflow (both files) first.

**Files:**
- Modify: `.github/workflows/release.yml` (whole file: three jobs, Store package only)
- Delete: `scripts/r2-prune.js` (used only by the R2 steps)
- Modify: `docs/updates-setup.md` (section 6 and 7: releases make only the Store package), `CLAUDE.md` (layout: release.yml and r2-prune.js lines; Status)
- Test: `$T/unit/release-workflow.test.js` (replace the two Store tests)

- [ ] **Step 1: Replace the Store tests** in `$T/unit/release-workflow.test.js` (keep the header, the step parser and `every run block parses in bash`; delete the other two `test(…)` blocks) with:

```js
test('Store only: three jobs, no secrets, nothing to R2', () => {
  assert.match(Y, /^ {2}check:\n[\s\S]*^ {2}build:\n[\s\S]*^ {2}publish:\n/m);
  assert.doesNotMatch(Y, /secrets\.|R2_|aws |sastra-update|update-config|EXE:/);
  assert.match(Y, /^ {2}MSIX: Sastra-PDF-Store-\$\{\{ inputs\.version \}\}\.msix$/m);
  assert.match(step('The version matches package.json').run, /readStoreInfo\('store\.json'\)/);
  assert.match(step('Build the Store package').run, /electron-builder --win appx --publish never --config build\/store\.config\.js/);
  assert.match(step('The package has the menu').run, /node scripts\/store-check\.js dist-store "\$MSIX"/);
  const g = step('GitHub release').run;
  assert.match(g, /gh release create "v\$VERSION" "dist-store\/\$MSIX"/); assert.match(g, /sha256sum "dist-store\/\$MSIX"/);
});
test('only check and publish get the GitHub token; build runs other people\'s code without it', () => {
  const build = Y.slice(Y.indexOf('\n  build:'), Y.indexOf('\n  publish:'));
  assert.doesNotMatch(build, /GH_TOKEN|contents: write/);
  assert.match(Y.slice(Y.indexOf('\n  publish:')), /contents: write/);
});
```

Run: `node --test "$T/unit/release-workflow.test.js"` → the new tests FAIL.

- [ ] **Step 2: Write the new `.github/workflows/release.yml`**

```yaml
# Builds the Microsoft Store package and makes it a GitHub release (store.js, build/store.config.js): download
# Sastra-PDF-Store-<version>.msix from the release and submit it in Partner Center; Microsoft signs it and the Store
# updates installed copies (docs/updates-setup.md section 7). Since 1.2.0 there is no installer and nothing goes to R2:
# copies installed from an installer stay on 1.2.0 (R2 still serves it to them; its What's new points to the Store).
# Runs only by hand: Actions > Release > Run workflow, type the version (= package.json), or
#   gh workflow run release.yml -f version=1.3.0
# Pushing code or tags never releases.
#
# Three jobs, each on its own fresh machine, and no secret at all: "check" (the GitHub token, installs nothing) — the
# version and store.json; "build" runs other people's code (pnpm install, electron-builder) with no token; "publish"
# (the GitHub token, installs nothing) makes the GitHub release with the package.
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: Version to release, the same as package.json (e.g. 1.3.0)
        required: true

permissions:
  contents: read

concurrency:
  group: release
  cancel-in-progress: false

env:
  VERSION: ${{ inputs.version }}
  MSIX: Sastra-PDF-Store-${{ inputs.version }}.msix

jobs:
  # Before anything is built: the version, and the Store identity the package is built with.
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: The version matches package.json, is not released yet, and store.json holds the Store identity
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          v="$(node -p "require('./package.json').version")"
          if [ "$v" != "$VERSION" ]; then
            echo "::error::You typed $VERSION, but package.json says $v. Bump package.json, push main, then run again."; exit 1
          fi
          if gh release view "v$VERSION" >/dev/null 2>&1 || git ls-remote --exit-code --tags origin "refs/tags/v$VERSION" >/dev/null; then
            echo "::error::v$VERSION is already released. Bump the version for a new release."; exit 1
          fi
          node -e "if (!require('./store').readStoreInfo('store.json')) { console.error('::error::store.json is missing or not valid: see docs/updates-setup.md section 7'); process.exit(1); }"

  # Other people's code runs here (pnpm install, electron-builder): no secret, no GitHub token.
  build:
    needs: check
    runs-on: windows-latest
    timeout-minutes: 40
    permissions:
      contents: read
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6   # the pnpm version comes from package.json "packageManager"

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Install (fetches Electron, copies the PDF libraries, checks About versions)
        run: pnpm install --frozen-lockfile

      - name: Check What's new has notes for this version (app/notes.js)
        run: node scripts/check-notes.js

      - name: Build the File Explorer menu (C++ DLL; needs the runner's Visual Studio + Windows SDK)
        run: node scripts/build-explorer-menu.js

      - name: Build the Store package
        run: pnpm exec electron-builder --win appx --publish never --config build/store.config.js

      - name: The package has the menu, and no update key
        run: node scripts/store-check.js dist-store "$MSIX"

      - uses: actions/upload-artifact@v7
        with:
          name: store
          path: dist-store/${{ env.MSIX }}
          if-no-files-found: error
          retention-days: 5
          compression-level: 0

  # Only the built package and this repository's own scripts (nothing installed), with the GitHub token.
  publish:
    needs: [check, build]
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write   # create the tag and the GitHub release
    defaults:
      run:
        shell: bash
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - uses: actions/download-artifact@v8
        with:
          name: store
          path: dist-store

      - name: GitHub release (notes from What's new)
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          node scripts/release-notes.js "$VERSION" > notes.md
          printf '\n%s is for the Microsoft Store: submit it in Partner Center (docs/updates-setup.md section 7). Microsoft signs it.\n\nSHA-256 of the package: `%s`\n' \
            "$MSIX" "$(sha256sum "dist-store/$MSIX" | cut -d' ' -f1)" >> notes.md
          gh release create "v$VERSION" "dist-store/$MSIX" --target "$GITHUB_SHA" --title "Sastra PDF $VERSION" --notes-file notes.md
```

Delete `scripts/r2-prune.js` (`git rm scripts/r2-prune.js`).

- [ ] **Step 3: Run it — it passes**

Run: `node --test "$T/unit/release-workflow.test.js"` → `# pass 3`.

- [ ] **Step 4: Docs.** In docs/updates-setup.md section 6, replace the paragraph that starts `The job checks the version and the six secrets…` with: `The job checks the version and store.json, builds the Store package with the right-click menu inside, checks it has no update key, and makes the GitHub release v<version> with the notes and Sastra-PDF-Store-<version>.msix. Then submit it (section 7, "Each release"). Nothing goes to R2 any more: the bucket, its lock and keys stay so 1.2.0 installer copies keep finding 1.2.0.` In section 7, delete the sentence `Version 1.2.0 is the last one for installer copies; after Microsoft has published Sastra PDF, releases make only the Store package.` and write `Since <version>, releases make only the Store package.` In CLAUDE.md, change the release.yml layout line to the three-job Store-only description and remove the `scripts/r2-prune.js` line; add a Status line.

- [ ] **Step 5: Commit, then ask before pushing**

```bash
cd /e/_httdocs/SastraPDF && git add -A .github/workflows/release.yml scripts/r2-prune.js docs/updates-setup.md CLAUDE.md && git commit -m "ci: the release makes only the Microsoft Store package — no installer, nothing to R2, no secret

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

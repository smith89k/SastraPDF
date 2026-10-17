# Logo-Red Accent and Icon Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> (2026-10-17: executed inline with superpowers:executing-plans — no sub-agents were asked for.)

**Goal:** The app's accent colour matches the new red logo (readable in both themes), and an update shows the new icons at once.

**Architecture:** Only the `--accent`, `--accent-soft`, `--accent-fg` CSS tokens change, in the three theme blocks of
`app/index.html` and `app/task.html` (every accent use already reads them). `build/installer.nsh` `customInstall` ends by
refreshing Windows' icon cache. Spec: `docs/superpowers/specs/2026-10-17-brand-colours-design.md`.

**Tech Stack:** CSS custom properties; NSIS (electron-builder 26.15.3 `nsis.include`); Playwright (`playwright-core`) test outside the project.

## Global Constraints
- Light: `--accent:#cc2229; --accent-fg:#ffffff; --accent-soft:rgba(204,34,41,.12)`.
- Dark (system-dark block AND `[data-theme="dark"]` block): `--accent:#ff5c61; --accent-fg:#1f0a0b; --accent-soft:rgba(255,92,97,.16)`.
- task.html has no `--accent-soft`; don't add one.
- No other token changes. Old values (#b8432a, #e46a4f, 184,67,42, 228,106,79, #1a0d09) must be gone from app/.
- Electron launches: `unset ELECTRON_RUN_AS_NODE`; `--user-data-dir=<scratch>`; poll with `page.evaluate`.
- `<S>` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad`, tests in `<S>\t\`.
- Commits on `feat/explorer-images`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No merge, no push.

---

### Task 1: Accent tokens

**Files:**
- Modify: `app/index.html:18,26,31` (the three `--accent` lines), `app/task.html:12,17,20`
- Test: `<S>\t\colour-test.js`

- [ ] **Step 1: Write the failing test `<S>\t\colour-test.js`**

```js
// The accent colour = the logo's red, readable (WCAG AA 4.5:1), in the main window and the task window, both themes.
const { _electron } = require('playwright-core');
const fs = require('fs'), path = require('path');
const APP = 'E:/_httdocs/SastraPDF', T = __dirname, PACKED = process.env.PACKED === '1';
const EXE = PACKED ? path.join(APP, 'dist/win-unpacked/Sastra PDF.exe') : path.join(APP, 'node_modules/electron/dist/electron.exe');
const PRE = PACKED ? [] : [APP];
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info !== '' ? '  — ' + info : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WANT = { light: { accent: '#cc2229', fg: '#ffffff', soft: 'rgba(204,34,41,.12)' }, dark: { accent: '#ff5c61', fg: '#1f0a0b', soft: 'rgba(255,92,97,.16)' } };
// reads the tokens and a primary button's colours for a theme; runs inside a page
const probe = theme => {
  document.documentElement.dataset.theme = theme;
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim().toLowerCase().replace(/\s+/g, '');
  const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'x'; document.body.appendChild(b);
  const bs = getComputedStyle(b), out = { accent: v('--accent'), fg: v('--accent-fg'), soft: v('--accent-soft'), bg: bs.backgroundColor, color: bs.color };
  b.remove(); return out;
};
const lum = rgb => { const c = rgb.match(/\d+/g).slice(0, 3).map(n => +n / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hexRgb = h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
(async () => {
  // no old colour left anywhere in app/ (vendor excluded)
  const old = /b8432a|e46a4f|184,\s*67,\s*42|228,\s*106,\s*79|1a0d09/i, hits = [];
  for (const f of fs.readdirSync(path.join(APP, 'app'))) if (/\.(html|js|css)$/.test(f) && old.test(fs.readFileSync(path.join(APP, 'app', f), 'utf8'))) hits.push(f);
  check('old terracotta colours are gone from app/', hits.length === 0, hits.join(' '));

  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: EXE, args: [...PRE, '--user-data-dir=' + path.join(T, 'ud-colour-test')], env });
  const page = await app.firstWindow();
  for (let k = 0; k < 100 && !(await page.evaluate(() => document.readyState === 'complete')); k++) await sleep(100);
  // the task window's page, loaded on its own (only its CSS matters here)
  await app.evaluate(async ({ BrowserWindow, app: a }) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    globalThis.__taskProbe = w; await w.loadFile(require('path').join(a.getAppPath(), 'app', 'task.html'));
  });
  for (const theme of ['light', 'dark']) {
    const w = WANT[theme];
    const m = await page.evaluate(probe, theme);
    check(`main window ${theme}: tokens = logo red`, m.accent === w.accent && m.fg === w.fg && m.soft === w.soft, JSON.stringify(m));
    check(`main window ${theme}: primary button uses them`, m.bg === hexRgb(w.accent) && m.color === hexRgb(w.fg), `${m.bg} / ${m.color}`);
    check(`main window ${theme}: button text contrast ≥ 4.5`, contrast(m.bg, m.color) >= 4.5, contrast(m.bg, m.color).toFixed(2));
    const t = await app.evaluate(async (_e, src) => globalThis.__taskProbe.webContents.executeJavaScript(src), `(${probe.toString()})(${JSON.stringify(theme)})`);
    check(`task window ${theme}: accent = logo red, button uses it`, t.accent === w.accent && t.fg === w.fg && t.bg === hexRgb(w.accent), JSON.stringify(t));
  }
  // accent as text on the bars and panels stays readable
  check('light: accent on #efece8 and #f8f6f3 ≥ 4.5', contrast(hexRgb(WANT.light.accent), 'rgb(239, 236, 232)') >= 4.5 && contrast(hexRgb(WANT.light.accent), 'rgb(248, 246, 243)') >= 4.5);
  check('dark: accent on #1f1d1b and #272523 ≥ 4.5', contrast(hexRgb(WANT.dark.accent), 'rgb(31, 29, 27)') >= 4.5 && contrast(hexRgb(WANT.dark.accent), 'rgb(39, 37, 35)') >= 4.5);
  await app.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd <S>/t && unset ELECTRON_RUN_AS_NODE && node colour-test.js`
Expected: FAIL on "old terracotta colours are gone", the token and button checks (they show #b8432a / #e46a4f); `1 FAILED` or more.

- [ ] **Step 3: Change the tokens**

`app/index.html` line 18 (light):
```css
  --fg:#23201c; --muted:#6c665e; --accent:#cc2229; --accent-fg:#ffffff; --accent-soft:rgba(204,34,41,.12);   /* the logo's red, one step deeper so white text reads (5.5:1) */
```
Lines 26 and 31 (dark, both blocks):
```css
  --fg:#ece8e2; --muted:#a29b91; --accent:#ff5c61; --accent-fg:#1f0a0b; --accent-soft:rgba(255,92,97,.16);
```
`app/task.html` line 12:
```css
  --chrome:#efece8; --panel:#f8f6f3; --line:#dcd7d0; --fg:#23201c; --muted:#6c665e; --accent:#cc2229; --accent-fg:#ffffff;
```
Lines 17 and 20:
```css
  --chrome:#1f1d1b; --panel:#272523; --line:#34312e; --fg:#ece8e2; --muted:#a29b91; --accent:#ff5c61; --accent-fg:#1f0a0b;
```

- [ ] **Step 4: Run it until it passes**

Run: `cd <S>/t && unset ELECTRON_RUN_AS_NODE && node colour-test.js`
Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
cd /e/_httdocs/SastraPDF && git add app/index.html app/task.html && git commit -m "feat: accent colour = the logo's red (readable in both themes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fresh icons after an update

**Files:**
- Modify: `build/installer.nsh` (`customInstall`)

- [ ] **Step 1: Add the refresh at the end of `customInstall`**

```nsis
!macro customInstall
  DetailPrint "Adding Sastra PDF to the File Explorer right-click menu..."
  ${if} ${Silent}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install --silent'
  ${else}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --explorer-menu=install'
  ${endif}
  ; An update keeps the same paths, so Windows would keep showing the old icons from its icon cache
  ; (shortcuts, taskbar, .pdf files): refresh it. The 64-bit ie4uinit sits behind Sysnative for this 32-bit installer.
  ${if} ${FileExists} "$WINDIR\Sysnative\ie4uinit.exe"
    ExecWait '"$WINDIR\Sysnative\ie4uinit.exe" -show'
  ${else}
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
  ${endif}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)'   ; SHCNE_ASSOCCHANGED, SHCNF_FLUSH
!macroend
```

- [ ] **Step 2: Check the script compiles** — the installer build in Task 3 Step 2 compiles it (electron-builder stops on an
  NSIS error). Commit:

```bash
cd /e/_httdocs/SastraPDF && git add build/installer.nsh && git commit -m "fix: installer refreshes Windows' icon cache so updates show the new icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Everything still works; 1.1.0 installer rebuilt; docs

**Files:**
- Modify: `CLAUDE.md` (Design line: "terracotta accent" → the logo's red with the values; Status entry)

- [ ] **Step 1: From source** — `cd <S>/t && unset ELECTRON_RUN_AS_NODE`, then each of `node colour-test.js`, `node images-test.js`,
  `node menu-test.js all`, `node ops-test.js`, `node nozip-test.js`, `node close-test.js`, `node print-test.js`, then
  `cp pdfs/ten.pdf out/ten.pdf && node titlebar-test.js` (print-test empties `out/`). Expected: `ALL PASS` / `n/n passed` each.
- [ ] **Step 2: Rebuild the installer** — `cd /e/_httdocs/SastraPDF && rm -rf dist/win-unpacked.tmp && npm run dist`
  (retry once on "EPERM … win-unpacked.tmp"). Expected: `dist\Sastra PDF Setup 1.1.0.exe`.
- [ ] **Step 3: Packaged** — the same list with `PACKED=1`, plus `PACKED=1 node colour-preview.js` for after-screenshots
  (`shots-colour\light-red.png` etc. now show the real build). Expected: all pass.
- [ ] **Step 4: Docs + commit** — CLAUDE.md Design bullet: replace `terracotta accent` with
  `accent = the logo's red (light #cc2229, dark #ff5c61; 2026-10-17, was terracotta — chosen for ≥ 4.5:1 contrast)`;
  Status entry gets the colour test count and the installer's SHA-256. Commit `docs: logo-red accent, icon refresh`.

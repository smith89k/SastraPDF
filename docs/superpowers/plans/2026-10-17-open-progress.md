# Progress box while PDFs open — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When opening PDFs (or the right-click Combine) takes longer than half a second, a box like the right-click progress window shows the file, the step, a bar, Cancel, and any problems.

**Architecture:** One job runner in app/index.html (`startProgress`) owns the box: it appears through the existing `inTurn` queue 500 ms after a job starts if the job is still running, stays at least 400 ms, lists problems and then waits for Close. Opening goes through one queue (`queueOpen`) fed by every way of opening; `loadPdf` reports page progress and can be cancelled. main.js's Open dialog returns paths only, so files are read one by one.

**Tech Stack:** Electron 44 page (classic script in app/index.html), pdf.js 6.4.299, pdf-lib 1.17.1, playwright-core 1.64.1 for tests.

**Spec:** docs/superpowers/specs/2026-10-17-open-progress-design.md

## Global Constraints

- Box appears only if the job still runs `SHOW_AFTER_MS = 500` after it started; once shown it stays at least `MIN_SHOWN_MS = 400`.
- The box is `.modal-bg` > `.modal.progress`, opened through `inTurn` (never over another box, one at a time); no Windows message boxes.
- Look and words = Bohpum's reading box (C:\_httdocs\Bohpum src/app.js `readingBox`, src/app.css `.modal.progress`), the user's choice ("go"): classes `.modal.progress` `.p-head` `.p-what` `.p-step` `.p-bar` `.p-fill` `.p-lines` `.p-foot`, `.failed`; background `--chrome`; width `min(440px, calc(100vw - 32px))`; Sastra's pdf-file.png 26 × 34; the fill is Bohpum's sliding stripe (35 % wide, 1.4 s) while the fraction is unknown, a real width when known (pages / files), full and still when failed.
- Words: title `Opening <name>` (several files: step `File 2 of 3 · Reading the file…`); steps `Reading the file…`, `Opening…`, `Reading page 120 of 950`. Ending with problems: `.failed`, title `Couldn't open <name>` (one file in the job) or `Couldn't open N files`, step `1 problem below` / `N problems below`, button **Close** (primary, focused). Combine: title `Combining 3 files` / `Making <name>`, step `Adding file 2 of 3`; with problems the title stays (a PDF was made) or becomes `No PDF made`.
- Problem lines: `<name> — password-protected, so it can't be opened here` · `<name> — damaged or not a PDF` · `<name> — couldn't be read: <reason>`.
- Cancel / Esc while running: the current file gets no tab, later files are skipped, opened files stay. With problems at the end the button is **Close** and the box waits; without problems it closes by itself.
- Files arriving during a job join it (`File 6 of 8`), never "Please wait".
- Tests live outside the repo in `T = C:\Users\taing\AppData\Local\Temp\claude\c---httdocs-SastraPDF\59bf0bdb-0c3e-43b2-b587-2ac1889029e7\scratchpad\t` (helpers `launch.js`, `waitFor`, `checker`); launches clear `ELECTRON_RUN_AS_NODE`.
- Work on main; commit per task; never push without asking.

## Review Focus

1. **Cancel while pdf.js is still parsing a huge file** → no half tab, no stray error toast, the next job works. Pinned in Task 2 (cancel during "Opening…").
2. **A job that finishes between 400 and 500 ms, or right at the threshold** → no flash (never shown) or shown ≥ 400 ms, never a blink. Pinned in Task 1 (timing check with a 450 ms read and a 700 ms read).
3. **An update box (or What's new) already open when a slow open starts** → the job runs, the progress box waits its turn and only shows if still needed. Pinned in Task 1.
4. **The same file opened twice in one job, or one already open** → one tab, switches to it, no problem line. Pinned in Task 1.
5. **Edits after opening still work** (`loadPdf` is also the reload after every edit) → rotate/undo after a big open works. Pinned in Task 2.

---

### Task 1: The box, the job runner and the open queue (paths)

**Files:**
- Modify: `app/index.html` (CSS next to `.modal.checking`; new section "Progress box" after the Updates section; `openResults`/`openPaths`/`openCmd` rewritten onto the queue; `openBytes` split into `openDoc` + toast wrapper), `main.js:226-233` (`open-dialog` returns `[{ path, name }]` without reading)
- Test: `$T\open-progress-test.js`

**Interfaces:**
- Produces (page-internal):
  - `startProgress({ title }) → job` with `job.update({ name, step, frac })` (`frac` 0..1 or `null` = moving), `job.problem(text)`, `job.cancelled` (boolean), `job.onCancel(fn)`, `job.end() → Promise<void>` (resolves when the box is gone; at once if never shown and no problems)
  - `openDoc(bytes, name, opts, hooks) → Promise<doc>` throwing an `Error` whose `.userReason` is the problem text's reason; `openBytes(bytes, name, opts)` keeps its behaviour (toast + `null`) for every other caller
  - `queueOpen(items) → Promise<void>`; item = `{ name, path, read: () => Promise<{ data?: ArrayBuffer, error?: string }> }`
- main.js `open-dialog` → `[{ path, name }]`; the page reads each with `desk.readFile`.

- [ ] **Step 1: Write the failing test** `$T\open-progress-test.js` (plain script, PASS/FAIL lines). Make test files in `$T\pdfs\`: `three.pdf` (exists), `p1..p5.pdf` (2 pages each), `bad.pdf` (text "not a pdf"). Slow reads by swapping main's handler: `ipcMain.removeHandler('read-file'); ipcMain.handle('read-file', async (_e, p) => { await new Promise(r => setTimeout(r, globalThis.__readDelay || 0)); const fs = process.mainModule.require('fs/promises'), path = process.mainModule.require('path'); try { const b = await fs.readFile(p); return { path: p, name: path.basename(p), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; } catch (e) { return { path: p, name: path.basename(p), error: e.message }; } })`. Open with `webContents.send('open-paths', [...])`. A MutationObserver in the page records every `.modal.progress` appearance with timestamps. Checks:
  1. `__readDelay 0`, open `three.pdf` → never a `.modal.progress`; tab opens.
  2. `__readDelay 450` → never shown (job ends before 500 ms).
  3. `__readDelay 1500`, open `p1.pdf` → box appears after ≥ 450 ms with title `Opening p1.pdf`, step `Reading the file…`, sliding fill (it has a running animation); closes by itself; it was visible ≥ 400 ms; tab opened.
  4. `__readDelay 700`, open `p1..p3.pdf` → step shows `File 2 of 3` at some point; all three tabs; box gone.
  5. During a job of `p1..p3` (delay 800), send `open-paths [p4, p5]` → `File 4 of 5` appears; 5 tabs; no "Please wait" toast.
  6. `bad.pdf` + a missing path + `p1.pdf` (delay 600) → box stays, `.failed`, title `Couldn't open 2 files`, step `2 problems below`, lines `bad.pdf — damaged or not a PDF` and `missing.pdf — couldn't be read: …`, button `Close` focused, p1 tab opened; Close → gone; no error toast. And `bad.pdf` alone → title `Couldn't open bad.pdf`, step `1 problem below`.
  7. Cancel (Esc) during `File 1 of 3` (delay 1500) → box gone (no problems), no new tabs except ones finished; then opening `p4.pdf` works.
  8. `three.pdf` already open + `three.pdf` again in a job → switches to it, no problem line, still one `three.pdf` tab.
  9. About open (`#bAbout`), then a slow open (delay 1500) → no `.modal.progress` while About is open; the tab still opens; closing About after the job ended shows nothing.
- [ ] **Step 2: Run** — `node "$T/open-progress-test.js"` → FAIL (no `.modal.progress`).
- [ ] **Step 3: Implement**
  - main.js `open-dialog`: `return r.canceled ? [] : r.filePaths.map(p => ({ path: p, name: path.basename(p) }))` (keep `remember('open', …)`); `readPdf` stays for `read-file`.
  - index.html: `startProgress` (timer `SHOW_AFTER_MS`, `inTurn(() => show)` where show returns a Promise resolved when the box closes and is skipped if the job ended without problems; `MIN_SHOWN_MS` before closing; Esc/Cancel → `job.cancelled = true` + run `onCancel` fns; with problems Cancel becomes Close and Esc closes); `queueOpen` keeps one running job (`openJob`), appends items to it while running (total grows), waits `while (state.busy && !openJob)` like combinePaths, runs inside `busy('Opening …')`, de-duplicates by path against open docs and the job, and per item: `update({ name, step: total > 1 ? 'File i of n · Reading the file…' : 'Reading the file…', frac: null })` → `read()` → if cancelled stop → `openDoc` → problem lines from `.userReason`. `openPaths(paths)` / `openCmd` / `openResults` call `queueOpen` with `read: () => desk.readFile(p)`.
  - CSS `.modal.progress` per Global Constraints (copy task.html's head/bar/problems/foot rules under `.modal.progress`; moving stripe = an animated gradient on the fill when `frac === null`, slowed under `prefers-reduced-motion`).
- [ ] **Step 4: Run** — PASS (9 checks); re-run `update-ui-test.js`, `menu-repair-ui-test.js`, `close-check.js`, `main-wiring-test.js` → ALL PASS.
- [ ] **Step 5: Commit** — `git add main.js app/index.html && git commit -m "feat: a progress box while PDFs open, when it takes more than a moment"`

---

### Task 2: Page progress and Cancel inside pdf.js

**Files:**
- Modify: `app/index.html` (`loadPdf`, `openDoc`)
- Test: `$T\open-progress-test.js` (more checks), big file `$T\pdfs\big.pdf` (3000 pages, pdf-lib)

**Interfaces:**
- Consumes: Task 1 `job.update`, `job.onCancel`, `job.cancelled`.
- Produces: `loadPdf(d, { onPage, onTask, isCancelled } = {})` — `onTask(loadingTask)` right after `getDocument`, `onPage(i, n)` in the size loop, throws `Error('cancelled')` (with `.cancelled = true`) when `isCancelled()` turns true; every existing call `loadPdf(d)` unchanged.

- [ ] **Step 1: Add the failing checks**
  10. Open `big.pdf` (delay 0) → step goes `Opening…` then `Reading page n of 3000` with `frac` growing (fill width increases between two samples); tab with 3000 pages.
  11. Cancel during `Reading page …` → no tab for big.pdf, no error toast, `state` has no doc named big.pdf (check the tab strip), and opening `p1.pdf` afterwards works.
  12. Cancel within 50 ms of the box appearing for big.pdf with delay 600 (it is then reading or in `Opening…`) → same outcome as 11.
  13. After opening big.pdf: `Ctrl+Shift+R` rotates (title `•`), `Ctrl+Z` undoes — the edit path still works.
- [ ] **Step 2: Run** → FAIL (no `Reading page`).
- [ ] **Step 3: Implement** `loadPdf` hooks; `openDoc` passes `onPage: (i, n) => job.update({ step: 'Reading page ' + i + ' of ' + n, frac: … })` (throttle DOM writes to one per animation frame), `onTask: t => job.onCancel(() => t.destroy())`, and on `.cancelled` closes the pdf and throws without a problem line.
- [ ] **Step 4: Run** — all checks PASS; the four other suites PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: page-by-page progress and Cancel while a PDF opens"`

---

### Task 3: Dropped files and the Combine panel's Add files

**Files:**
- Modify: `app/index.html` (`openFiles`)
- Test: `$T\open-progress-test.js`

**Interfaces:**
- Consumes: `queueOpen` with `read: async () => ({ data: await f.arrayBuffer() })`, `path: desk?.pathForFile(f) || null`.

- [ ] **Step 1: Add the failing check**
  14. Drop `p1.pdf` and `bad.pdf` as File objects (Playwright: `page.evaluate` builds a `DataTransfer` from fetched bytes and dispatches `drop` on `window`) → `bad.pdf — damaged or not a PDF` in the box with Close (today: a toast), p1 tab opened.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `openFiles` → filter as today (non-PDF toast stays), then `queueOpen`.
- [ ] **Step 4: Run** — PASS; other suites PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: dropped files open through the progress box"`

---

### Task 4: Right-click Combine / Make PDF in the same box

**Files:**
- Modify: `app/index.html` (`combinePaths`)
- Test: `$T\open-progress-test.js`

**Interfaces:**
- Consumes: `startProgress({ title })`.

- [ ] **Step 1: Add the failing checks** (send `combine-paths` from main):
  15. `[p1, p2, p3]` with delay 700 → box title `Combining 3 files`, step `Adding file 2 of 3`, bar fills by files; one new tab `Combined.pdf` with 6 pages; success toast `Combined 3 files · 6 pages` stays.
  16. `[p1, bad.pdf, missing.pdf]` → box stays with two problem lines and Close; tab `Combined.pdf` with 2 pages; no `Couldn't read:` toast.
  17. `[bad.pdf]` → box stays, title `No PDF made`, step `1 problem below`; no tab.
  18. Cancel during `[p1..p5]` → no Combined tab.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — wrap the existing loop with `startProgress({ title: name })`; per file `update({ name: title, step: 'Adding file i of n', frac: (i - 1) / n })`; unreadable → `job.problem(…)` with the same reasons as opening; `job.cancelled` → stop, no tab; the toast keeps only the success part.
- [ ] **Step 4: Run** — PASS; other suites PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat: right-click Combine shows the same progress box"`

---

### Task 5: Notes

**Files:** `CLAUDE.md` (How app/index.html works: the progress box, `startProgress`, `queueOpen`, the 500/400 ms rules, open-dialog returns paths; Status: tests), `app/notes.js` (top entry: `['new', 'Opening a big PDF now shows a progress box with the file, the page it is on and a Cancel button. Problems stay listed in the box until you close it.']`)

- [ ] **Step 1:** Write both; `node scripts/check-notes.js` → OK.
- [ ] **Step 2: Commit** — `git commit -am "docs: the progress box in CLAUDE.md and What's new"`

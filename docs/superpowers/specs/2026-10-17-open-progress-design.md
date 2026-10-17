# A progress box while PDFs open — design

Date: 2026-10-17 · Status: approved by the user ("ok").
The user's words: "Opening a .pdf file inside app should shows a progress box, just like the right-click convert window.
similar to bohpum"; when: "only when opening takes more than a moment"; the picture played back in chat → "ok".
Model: Bohpum (C:\_httdocs\Bohpum, `.modal.progress` in src/app.js) — while a file is read, a box like its Explorer-menu
convert window covers the editor: the file, a step line, a bar, Cancel; it closes by itself; a problem stays with Close.

## Why
Today opening shows only a small spinner in the status bar ("Opening 2 files…"). A big or slow PDF (hundreds of pages, a
scan, a network drive) looks like nothing is happening, and a problem is a toast that disappears after a few seconds.

## Goals
1. When opening takes longer than a moment, a box over the window shows **which file**, **what it is doing**, and a
   **bar**, with **Cancel** — looking like the right-click progress window (app/task.html).
2. Small PDFs open exactly as today: no box flashes.
3. Problems (damaged, password-protected, unreadable) are listed in the box, which then stays with **Close**.
4. The same box for the right-click **Combine / Make PDF** (my call — it reads files from disk too).

## Non-goals
- Insert pages from a file, Split, Export, Save, Print keep what they have today.
- No percentage numbers or time estimates.
- The plain-browser fallback (no `desk`) is not required to show it (it may).

## Anti-goals
- A box that flashes for a split second on every small PDF.
- Cancel that leaves a half-opened tab, or closes files that had already opened.
- A Windows message box.
- Files dropped on the floor: today a second "Open with" during an open gets "Please wait for the current task to finish"
  and is lost.

## Behaviour
- **Every way of opening**: Open (button, Ctrl+O, ☰ › File › Open), double-click / "Open with" in File Explorer (start
  and second instance), files dragged onto the window, and the right-click Combine / Make PDF.
- **When it shows**: only if the job is still running about **0.5 s** after it started (my call). Once shown it stays at
  least ~0.4 s, so it never blinks on and off (my call).
- **What it says** (copy is the builder's, in the app's plain style):
  - Title line: the file's name (long names end in "…"), and with several files "File 2 of 5" on the step line.
  - Step line: "Reading the file…" (the bytes coming from disk; no progress is known — the bar moves on its own),
    "Opening…" (pdf.js reading the document — moving bar), then "Reading page 120 of 950" while every page's size is read
    (the bar fills by pages). For Combine: "Adding file 2 of 3" with the bar filling by files.
  - Several files: the bar covers the whole job.
- **Open dialog** (my call): today main reads every chosen file before the dialog call returns, so the page can't say
  which file is being read. Open then returns only the chosen paths, and each file is read one by one like "Open with".
  A file can't stop reading half-way (one IPC call), so Cancel during "Reading the file…" just ignores what comes back.
- **Cancel** (also Esc): stops the file being opened (pdf.js loading task destroyed, no tab made for it) and skips the
  rest; files already opened stay open. Combine: Cancel makes no tab at all.
- **Problems** go in a list in the box (like task.html's `#problems`), e.g. "report.pdf — password-protected, so it can't
  be opened here", "scan.pdf — damaged or not a PDF", "x.pdf — couldn't be read: <reason>". When the job ends with any
  problem, the box stays with **Close** (Cancel becomes Close); without problems it closes by itself. Problems replace
  the toasts opening shows today. A file that is already open just switches to its tab (no problem).
- **More files arriving** while the box is up (another "Open with", a drop, Open): they join the same job ("File 6 of 8"),
  never lost.
- **Other boxes**: it is a `.modal-bg` box, so the update box and the menu-repair box wait for it (whenFree), and it never
  appears over another box: if one is open when an open starts, the job still runs and the box shows once the other box
  closes (if still needed). At start-up, What's new still opens after the start-up files.
- The status-bar spinner stays as it is underneath (other code checks `state.busy`).

## Look
Same parts and sizes as app/task.html: PDF file icon (app/pdf-file.png, 26 × 34), the name in semibold, the muted step
line, the 6 px bar in `--accent`, a moving stripe when progress is unknown, the problem list in `--err`, buttons
bottom-right. Width like task.html (440 px). Light and dark themes.

## Testing (builder plans the details)
- Playwright from source with main's `read-file` slowed down (swap the IPC handler with a delayed one), so the box shows
  reliably; and a real big PDF (a generated 1500–3000-page file) for "Reading page n of m".
- A small PDF: no box at all (watch for any `.modal.progress` during the open).
- Cancel at each step: no half tab, earlier files stay, later ones skipped.
- Problems: a damaged file, a password-protected file, a missing file → listed, Close.
- Several files and a second "Open with" during a job → one job, all opened.
- Combine from the right-click menu (the existing combine path) with an unreadable file.
- Existing suites that open files must still pass (update-ui, menu-repair-ui, close-check, main-wiring).

## Left to the builder
The exact copy, how the job queue is structured in index.html, the CSS (shared with task.html or copied), how "Reading the
file…" is timed against the 0.5 s threshold, and the test harness.

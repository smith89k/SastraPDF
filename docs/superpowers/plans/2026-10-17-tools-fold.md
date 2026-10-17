# Tools panel folding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each Tools-panel section folds on its own from its heading (icon left, chevron right), the folded ones are remembered, and Combine files moves to the bottom.

**Architecture:** Markup only in app/index.html: each `.tsec` gets `data-sec` and its `<h3>` holds a `<button class="tsec-head">`; CSS hides everything but the heading in `.tsec.folded`; an inline script right after `</aside>` restores `sastra-tools-folded` before first paint; the main script toggles and saves. `updateUI`'s no-PDF switch-off skips `.tsec-head`.

**Tech Stack:** plain HTML/CSS/JS, Playwright tests from source.

Spec: [docs/superpowers/specs/2026-10-17-tools-fold-design.md](../specs/2026-10-17-tools-fold-design.md)

## Global Constraints
- Do not build the installer. Work on main, commit, do not push. `unset ELECTRON_RUN_AS_NODE` before launching.
- Test: `<T>\tools-fold-test.js` (T = the shared test folder …\4e4e0838-…\scratchpad\t), already written.

---

### Task 1: Folding sections, Combine last

**Files:** Modify `app/index.html` (CSS lines `.tsec…`, the `<aside class="tools">` markup, the `updateUI` selector, a handler after `$('#cGo').onclick = …`). Test: `<T>\tools-fold-test.js`.

- [ ] **Step 1: Run the test** → FAIL (order, no `.tsec-head`).
- [ ] **Step 2: CSS** — replace `.tsec h3{…}` / `.tsec h3 svg{…}` with:

```css
.tsec h3{margin:0}
.tsec-head{display:flex;align-items:center;gap:8px;width:calc(100% + 16px);margin:-6px -8px;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:var(--muted);font:inherit;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-align:left;cursor:pointer}
.tsec-head:hover{background:var(--hover)}
.tsec-head:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.tsec-head svg{width:15px;height:15px;flex:none;color:var(--accent)}
.tsec-head svg.chev{margin-left:auto;width:14px;height:14px;color:inherit;transition:transform .15s}
.tsec.folded{padding-bottom:14px}
.tsec.folded>:not(h3){display:none}
.tsec.folded .chev{transform:rotate(180deg)}
```
plus `.tsec-head svg.chev{transition:none}` inside the existing `prefers-reduced-motion` rule.

- [ ] **Step 3: Markup** — sections in the order organize, split, export, combine; each heading:

```html
<section class="tsec" data-sec="organize">
  <h3><button class="tsec-head" aria-expanded="true"><svg class="i" data-i="pages"></svg><span>Organize pages</span><svg class="i chev" data-i="up"></svg></button></h3>
```
(split: icon `split`, "Split document"; export: `image`, "Export as images"; combine: `combine`, "Combine files"). After `</aside>`:

```html
    <script>/* folded Tools sections before first paint (sastra-tools-folded) */try{const f=JSON.parse(localStorage.getItem('sastra-tools-folded')||'[]');for(const s of document.querySelectorAll('#tools .tsec'))if(f.includes(s.dataset.sec)){s.classList.add('folded');s.querySelector('.tsec-head').setAttribute('aria-expanded','false')}}catch{}</script>
```

- [ ] **Step 4: JS** — in `updateUI` change `.tools :is(button,select,input)` to `.tools :is(button:not(.tsec-head),select,input)`; after `$('#cGo').onclick = combine; …`:

```js
// Tools sections fold on their own, as in Acrobat; the folded ones are remembered (restored before first paint, after </aside>)
for (const head of document.querySelectorAll('.tsec-head')) head.onclick = () => {
  const folded = head.closest('.tsec').classList.toggle('folded');
  head.setAttribute('aria-expanded', String(!folded));
  const keys = [...document.querySelectorAll('#tools .tsec.folded')].map(s => s.dataset.sec);
  try { keys.length ? localStorage.setItem('sastra-tools-folded', JSON.stringify(keys)) : localStorage.removeItem('sastra-tools-folded'); } catch {}
};
```

- [ ] **Step 5: Run the test** → ALL PASSED; screenshot the panel (open + two folded, light and dark) and look at it.
- [ ] **Step 6: Earlier suites** that touch the Tools panel: controls, colour, folders, ops, images → ALL PASSED.
- [ ] **Step 7: CLAUDE.md** — a "Tools panel" line in "How app/index.html works"; add the What's new note line `Improved: … sections of the Tools panel fold …` to 1.1.0 in app/notes.js. Commit.

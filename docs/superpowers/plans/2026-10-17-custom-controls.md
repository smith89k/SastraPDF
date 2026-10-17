# Bohpum-Style Dropdowns, Tick Boxes and Round Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> (2026-10-17: executed inline; one task — the user asked for it mid-way through the 1.1.0 work.)

**Goal:** Every dropdown, tick box and round option in Sastra PDF looks like Bohpum's (in Sastra red); keys pressed inside an open list stay in the list.

**Architecture:** CSS only for the look (`app/index.html`: `appearance: base-select` + `::picker(select)` / `::picker-icon` /
`::checkmark`; `appearance: none` tick boxes with a `--tick` SVG per theme). Three key guards: `isInput` counts anything inside a
`<select>`; print.js `keys` and the right-click menu ignore keys while a list is open. The printer box gets
`<button><selectedcontent>` so long names end in "…". Spec: `docs/superpowers/specs/2026-10-17-custom-controls-design.md`.

**Tech Stack:** Chromium customizable select (Electron 44); Playwright test outside the project.

## Global Constraints
- Tokens only (`--accent`, `--accent-soft`, `--accent-fg` via `--tick`, `--chrome`, `--panel`, `--line-strong`, `--muted`, `--hover`); no new colours.
- 16 × 16 border-box tick boxes, radius 4 px (round: 50 %); ticked = `--accent`.
- `<S>\t\` = `C:\Users\taing\AppData\Local\Temp\claude\e---httdocs-SastraPDF\4e4e0838-1457-4a28-ac3f-40a6d477efff\scratchpad\t\`.

### Task 1: Controls

**Files:** Modify `app/index.html` (tokens `--tick`, the dropdown / tick-box CSS block after the focus rule, `.chk` without
`accent-color`, `isInput`, the right-click menu keydown), `app/print.js` (`PICKED`, printer markup and refills, `keys` guard).
Test: `<S>\t\controls-test.js` (15 checks: look in light/dark for the main window and the print dialog; mouse pick in zoom;
keyboard pick in Split by; Delete inside an open list; ArrowDown in the right-click menu's zoom list; long printer name;
Esc in the print dialog's open Paper list; no console errors).

- [x] Step 1: write controls-test.js; run → FAIL (`appearance` auto, 13 × 13 default boxes, the zoom option not clickable)
- [x] Step 2: CSS block + `--tick` + `.chk` cleanup; `isInput` (`!!el.closest?.('select')`); menu keydown
  `if (e.target.closest('select')?.matches(':open')) return;`; print.js `keys` same guard
- [x] Step 3: run → long printer names pushed the chevron out; `select>button` + `selectedcontent` rules and `PICKED` in print.js
- [x] Step 4: run → 15/15 PASS; print-test 71/71
- [x] Step 5: commit `feat: Bohpum-style dropdowns, tick boxes and round options`

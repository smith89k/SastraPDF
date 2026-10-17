# Dropdowns, tick boxes and round options in the app's own look — design

Date: 2026-10-17 · Status: approved by the user in chat ("use custom dropdown select and tick/radio the same Bohpum app")

## Model: Bohpum (E:\_httdocs\Bohpum, src/app.css "dropdowns" and "tick boxes" blocks)
Bohpum styles every `<select>` with Chromium's customizable select (`appearance: base-select`, Chromium 135+;
Electron 44 has it) and draws its own check boxes / radio buttons with `appearance: none`. Sastra takes the same rules,
with Sastra's tokens and its new red accent (spec 2026-10-17-brand-colours-design.md).

## What changes (app/index.html CSS only, plus three key guards)
- **Dropdowns** (all 12: zoom, Split by, Format, Resolution; print dialog Printer, Subset, Pages per sheet, Page order,
  Booklet subset, Binding, Paper; the zoom copy in the right-click menu): `select, ::picker(select){appearance:base-select}`.
  The box keeps Sastra's field look (`.field select`, `.zoomsel`: border `--line-strong`, radius 6, `--chrome`). A 6 px
  chevron (`::picker-icon`, `--muted`) turns up and goes red when open; open box border = `--accent`. The list
  (`::picker(select)`): `--panel` card, 1 px `--line-strong`, radius 8, shadow `0 10px 30px rgba(0,0,0,.18)`, 6 px
  padding, 4 px gap from the box; options 30 px tall, radius 5, hover/focus `--hover`, chosen `--accent-soft` with a
  `::checkmark` in `--accent` on the right.
- **Tick boxes / round options** (Combine list, print dialog): `appearance:none`, 16 × 16 (border-box), 1.5 px
  `--line-strong` border (hover `--muted`), radius 4 (round: 50 %), background `--chrome`. Ticked: `--accent` fill +
  a tick drawn by `--tick` (white on light; `#1f0a0b` = `--accent-fg` on dark, so it keeps contrast on the light-red
  dark accent). Chosen round option: `--accent` with a 3 px `--chrome` ring inside. Disabled: opacity .5. Focus: the
  existing 2 px `--accent` outline. `accent-color` on `.chk` inputs goes (no longer used).
- **Keys inside an open list stay in the list** (focus is then on an `<option>`, which the page didn't count as a field):
  - `isInput(el)` also counts anything inside a `<select>`, so the page shortcuts (Delete = delete pages, arrows, Esc,
    H/V/F…) never fire while choosing.
  - print dialog (app/print.js `keys`): Esc with an open list closes only the list, not the dialog.
  - right-click menu: arrow keys / Tab inside its open zoom list don't jump to other menu entries.
- Task window: no dropdowns or tick boxes — unchanged.

## Testing (Playwright, `controls-test.js`, source and packaged)
- Every select (main window, print dialog, right-click menu) has computed `appearance` `base-select`.
- Every visible check box / radio: `appearance` none, 16 × 16, radius 4 px / 50 %; unticked background = `--chrome`;
  ticked = `--accent` + a background image; light and dark.
- Mouse: the zoom list opens, picking 100 % zooms to 100 %. Keyboard: Down opens Split by, Down + Enter picks the next mode.
- Delete pressed inside an open list deletes no page; Esc inside the print dialog's open Paper list keeps the dialog
  open, a second Esc closes it; ArrowDown in the right-click menu's open zoom list keeps the list open.
- Earlier suites still pass (print 71 uses these controls heavily). Before/after screenshots for the user.

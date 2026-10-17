# Accent colour from the new logo, and fresh icons after an update — design

Date: 2026-10-17 · Status: approved by the user in chat

## Why
The new logo and .pdf file icon are a pure red (hue ≈ 357°, mid tone #E82830; the logo's shading runs #C01820–#F84848).
The app's accent was the old terracotta (#B8432A light, #E46A4F dark), so "color theme and icon not match". The user:
"replace current red with match logo red (keep it as best practice color)". The user also asked: "make sure app icon change".

## 1. Accent colour (app/index.html and app/task.html, the `:root` tokens only)
| Theme | `--accent` | `--accent-soft` | `--accent-fg` |
|---|---|---|---|
| Light | `#cc2229` (was `#b8432a`) | `rgba(204,34,41,.12)` | `#ffffff` (unchanged) |
| Dark (both blocks: system dark and `data-theme="dark"`) | `#ff5c61` (was `#e46a4f`) | `rgba(255,92,97,.16)` | `#1f0a0b` (was `#1a0d09`) |

- Same hue as the logo; light is one step deeper than #E82830 because #E82830 gives white text only 4.40 : 1.
- Contrast (WCAG AA = 4.5 : 1 for normal text), measured: light — white on accent 5.49, accent on `--chrome` #efece8 4.66,
  on `--panel` #f8f6f3 5.09; dark — `--accent-fg` on accent 6.29, accent on #1f1d1b 5.57, on #272523 5.06. The old
  terracotta's light figures were 5.42 / 4.60 / 5.02, so nothing gets harder to read.
- Backgrounds, `--err` and every other token stay. Every accent use already reads these tokens (checked: no other copy of
  the old colour in app/, main.js or build/), so nothing else changes.

## 2. Icons right after an update (build/installer.nsh, `customInstall`)
The 1.1.0 build already carries the new icon (exe, shortcuts, .pdf association icon). But an update keeps the same paths,
and Windows shows icons from its icon cache, so shortcuts / taskbar / .pdf files can keep the old picture. At the end of
`customInstall`: run `ie4uinit.exe -show` (64-bit one through `$WINDIR\Sysnative` when the installer runs as 32-bit,
else `$SYSDIR`) and call `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_FLUSH)`. Both are harmless if nothing changed.
Note for the user: a .pdf file shows the icon of whichever app is the default for PDFs; ours only if Sastra PDF is it.

## Testing
- Grep: the old colours (#b8432a, #e46a4f, 184,67,42, 228,106,79, #1a0d09) appear nowhere in app/.
- Playwright: in both themes the computed `--accent` is the new value in the main window and the task window; a primary
  button's background is the accent and its text keeps ≥ 4.5 : 1; screenshots before/after.
- Earlier suites (images, menu, ops, folder, print, close, titlebar) still pass, from source and packaged.
- With the user after installing 1.1.0: desktop shortcut, Start menu, taskbar and the window show the new logo.

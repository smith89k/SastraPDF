# Tools panel: sections fold, as in Acrobat; Combine at the bottom — design

Date: 2026-10-17 · Status: approved by the user in chat ("right panel: should have collape expent of each section like
acrobat" → each section on its own, "arrow to the right, keep icon on the left", remembered → "Yes, build it"; then
"move combind section to the bottom")

## Behaviour
- Order: Organize pages, Split document, Export as images, **Combine files** (was second).
- Each section heading is a button (`.tsec-head`, `aria-expanded`) across the panel's width: the section's red icon and
  name on the left, a muted chevron on the right (`up` = open; it turns 180° to point down when folded, .15 s, none with
  reduced motion). Click / Enter / Space folds only that section (`.tsec.folded`: everything but the heading hidden);
  again opens it. Hover = `--hover` background; focus-visible = the accent outline, as other buttons.
- Folding works with no PDF open: `updateUI`'s no-document switch-off skips `.tsec-head`.
- Remembered: localStorage `sastra-tools-folded` = JSON list of folded `data-sec` keys (`organize`, `split`, `export`,
  `combine`), removed when none is folded. Applied by a tiny inline script right after the panel's markup, so the panel
  never paints open first. All open by default.

## Testing (Playwright `tools-fold-test.js`, from source)
Order of the four headings; icon left of the name, chevron at the right edge; click folds only that section (its controls
hidden, aria-expanded false, chevron turned 180°), the others unchanged; click again opens; Enter on a focused heading
folds; with no PDF open the headings are enabled and fold; Combine + Split folded survive a restart (classes there before
any app script runs); unfolding all removes the setting; light and dark; no console errors. Earlier suites still pass.

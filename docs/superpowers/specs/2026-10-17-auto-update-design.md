# Release to Cloudflare R2 and update automatically — design

Date: 2026-10-17 · Status: approved by the user ("yes"), address kept without "s" ("keep this sastra-update.smith89k.com").
The user's words: "build .exe file and upload to R2 cloudflare for auto update", "use github action", "create it
fresh, coz i will give user the new version by download from R2", "forget about ai-hub" (Sastra's own setup, nothing
shared with or modelled on AI Hub's), the update box is the app's own box ("not windows dialog?" → yes, the app's own),
address `sastra-update.smith89k.com` ("yes"), also used for the first download ("yes").

## Why
Today a new version reaches people only if they find the GitHub release page (a private repo) and run the installer by
hand. The user wants to hand out ONE download link, and from then on every installed copy keeps itself up to date.

## Goals
1. **Release from GitHub with one action:** GitHub → Actions → Release → Run workflow → type the version. GitHub builds
   the installer (with the Explorer right-click menu), puts it in a new Cloudflare R2 bucket for Sastra PDF, and makes the
   GitHub release page as before.
2. **One download link that never goes stale:** a fixed address that always gives the newest installer. Anyone with
   the link can download; only the release workflow can upload or delete.
3. **Installed copies update themselves:** check when the app starts and every 6 hours, download quietly, then ask in
   the app's own box: **Restart now** / **Later** (Later = installs when the app is closed).
4. **☰ › Help › Check for Updates** for checking by hand.
5. **The right-click menu survives updates:** if an update leaves it under "Show more options", the app offers to put it
   back (one Windows permission prompt).
6. **Honest privacy text:** the README says the app goes online by itself only to check for updates.

## Non-goals
- No beta/test channel; one channel for everyone.
- No download progress bar, no release notes inside the "ready" box (What's new already shows them after the restart).
- No updates for the portable build (`dist:portable`) or for `pnpm start`.
- No code signing now (SignPath is still pending; see "Later").
- Copies installed before this feature (1.0.x, the user's local 1.1.0 builds) do not update themselves: they install
  once from the link.
- No Mac/Linux.

## Anti-goals (would be a failure even if updates technically work)
- **An update throws away unsaved work.** Restart now must never close a PDF with unsaved changes without asking.
- **A Windows message box appears.** Every box is the app's own (`askChoice` style: no title bar, no X).
- **A box jumps up in the middle of something:** never over another `.modal-bg` box (print screen, What's new, About,
  a question) or a Present show — it waits.
- **The app sends anything about the user or their files.** Update checks only download the update files.
- **A release deletes or breaks what installed copies need** (the newest installer, `latest.yml`, older `.blockmap`
  files), or leaves `latest.yml` pointing at a file that isn't uploaded yet.
- **Nagging:** the menu-repair offer and the update box must not come back every start once answered.

## Decided by the user
- Builds run on **GitHub Actions** (the user upgraded to GitHub Pro on 2026-10-17, which should clear the billing block
  that stopped every run since 2026-10-15).
- A **fresh R2 bucket just for Sastra PDF**, nothing shared with any other app.
- People get Sastra PDF by **downloading from R2** (so the bucket is publicly downloadable, no Cloudflare Access lock).
- The app **checks by itself** (start + every 6 hours) and the README privacy promise changes accordingly.
- The update box is **the app's own box**, Restart now / Later; Later installs on close.
- The menu repair after an update, as described below.

## How it works

### Cloudflare (set up once by the user; steps go in docs/updates-setup.md)
- R2 bucket, e.g. `sastra-pdf` (name is the user's choice; it only goes in a GitHub secret).
- Public through the **custom domain `https://sastra-update.smith89k.com/`** (the user's choice; smith89k.com's DNS is
  already on Cloudflare). One address per app so apps never clash: `updates.smith89k.com` is already taken by another
  app, and future apps get `<app>-update.smith89k.com`. The r2.dev development URL stays off (rate-limited, not for real
  use). The address is written in ONE place in the code (package.json `build.publish.url`) and in the README link.
  **It must never change after the first release:** every installed copy has it built in, and copies would stop
  updating.
- An R2 API token with Object Read & Write on that bucket only (Access Key ID + Secret), plus the Account ID.
- The custom domain does not list the bucket's contents; only exact file names can be fetched.

### GitHub secrets (repository → Settings → Secrets and variables → Actions)
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. The update address is public and is NOT a
secret.

### What is in the bucket
| File | Cache | Purpose |
|---|---|---|
| `Sastra-PDF-Setup-<version>.exe` | long | the installer the updater downloads |
| `Sastra-PDF-Setup-<version>.exe.blockmap` (all versions kept) | long | lets an update download only the changed parts |
| `Sastra-PDF-Setup.exe` (fixed name, a copy of the newest) | `no-cache` | the link the user hands out: `https://sastra-update.smith89k.com/Sastra-PDF-Setup.exe` |
| `latest.yml` | `no-cache` | what installed copies read to see the newest version |

Cloudflare caches `.exe` files at its edge by default, so the fixed-name copy and `latest.yml` MUST be uploaded with
`Cache-Control: no-cache` or people get yesterday's version. *My call:* the fixed-name copy is served with
`Content-Disposition: attachment; filename="Sastra-PDF-Setup-<version>.exe"` so the downloaded file shows its version.

### Release workflow (.github/workflows/release.yml, replaces today's tag-push trigger)
- Trigger: **`workflow_dispatch` only**, input `version` (e.g. `1.2.0`). Pushing code or tags never releases.
- Before running it, the user (or Claude at release time) bumps `package.json` (`pnpm version X.Y.Z
  --no-git-tag-version --no-git-checks`), writes the What's new entry in app/notes.js, commits and pushes to main.
- Steps, in order:
  1. Checkout main, pnpm (version from `packageManager`), Node 24, `pnpm install --frozen-lockfile`.
  2. Stop with a plain error if the input ≠ package.json version, or a GitHub release / tag `v<version>` already exists.
  3. `node scripts/check-notes.js`, `node scripts/build-explorer-menu.js`,
     `pnpm exec electron-builder --win nsis --publish never`.
  4. Check the output has the installer, its `.blockmap` and `latest.yml`, and that `latest.yml` names that installer.
  5. Upload to R2 (AWS CLI, preinstalled on windows-latest; endpoint `https://<account>.r2.cloudflarestorage.com`,
     region `auto`, `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` and `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required`,
     which R2 needs with current AWS CLI versions). **Order matters:** installer + blockmap → the fixed-name copy →
     `latest.yml` LAST, so an installed copy never reads a `latest.yml` whose installer is missing. After each big
     upload, check the stored size equals the local size.
  6. Remove older `Sastra-PDF-Setup-<version>.exe` files from the bucket (never the new one, never the fixed-name copy,
     never any `.blockmap`). Only after step 5 succeeded.
  7. Create the tag `v<version>` on the built commit and the GitHub release (installer + SHA-256 in the notes), as
     today. *My call:* the notes come from that version's entry in app/notes.js (no more hand-written tag message).
  8. Keep the installer as a run artifact for a few days (handy if R2 misbehaves).
- The installer name changes to **`Sastra-PDF-Setup-${version}.exe`** (nsis `artifactName`): `latest.yml` names files
  with dashes, and a name with spaces would not match.
- package.json `build.publish` = `{ provider: 'generic', url: 'https://sastra-update.smith89k.com/' }` so electron-builder
  writes `latest.yml` and puts `app-update.yml` (the address) inside the app.

### Inside the app (main.js + a small new main-process module, and app/index.html)
- **electron-updater** (6.8.9 at the time of writing) becomes the app's first runtime `dependency`, so electron-builder
  now packs a small node_modules tree into app.asar. Check that this works with pnpm's layout (it did not need to
  before: there were no runtime dependencies) and that the installer grows only by about a megabyte.
- Runs only when `app.isPackaged`, on Windows, and not in the portable build (`process.env.PORTABLE_EXECUTABLE_DIR`).
  `pnpm start` never checks. A local `pnpm run dist` build does check (it reads the same address) — fine.
- First check about 10 seconds after the window is up (*my call:* not to slow the start or compete with opening
  files), then every 6 hours. `autoDownload = true`, `autoInstallOnAppQuit = true`.
- Offline, address unreachable, broken file: no box, no toast; one line in a log
  (*my call:* `%TEMP%\Sastra PDF\update.log`, like explorer-menu.log). The next check tries again.
- **Update downloaded →** main tells the page (`update-ready`, version). The page shows, through `askChoice`:
  "Sastra PDF X is ready to install." — detail "Restart now to use it, or it installs the next time you close Sastra
  PDF." — buttons **Later** (first = Cancel = Esc / click outside) and **Restart now** (primary, focused).
  - If another `.modal-bg` box is open or Present is running, it waits and shows as soon as that is gone.
  - Shown once per downloaded version per run of the app. Later → nothing more until the next start (where it is offered
    again if still not installed — *my call*), and the update installs when the app is closed anyway.
- **Restart now →** the page first does exactly what closing does: if any PDF has unsaved changes it asks with the same
  `askConfirm` question, worded for a restart ("… Restart Sastra PDF anyway?" / **Restart without saving**). Cancel =
  nothing happens. Only after that does it tell main to install.
  - **Constraint:** electron-updater's `quitAndInstall` starts the installer at once, and the installer closes the app
    by force. So it must only be called AFTER the page has confirmed — never by triggering the normal close flow and
    hoping it goes through. Main sets `allowClose` and calls `quitAndInstall(true, true)` (silent install, start the
    app again after).
  - While an Explorer-menu job is running in the task window (Split / Images), Restart now waits or says to wait —
    *my call*; the builder picks which. A job must not be killed half-way.
- **Closing normally** with an update downloaded installs it silently on the way out (electron-updater's
  `autoInstallOnAppQuit`); the next start is the new version and What's new opens as today.
- **☰ › Help › Check for Updates…** (new menu item in main.js, above What's New). Answers in the app's own box style:
  "Checking for updates…" (while it checks), then one of: "You have the latest version" (with the version),
  "Version X is downloading. You'll be asked to restart when it's ready.", the ready box above if already downloaded, or
  "Couldn't check for updates. Check the internet connection and try again." In `pnpm start` / portable: "Updates work
  only in the installed app." Does nothing while another box is open, like About.

### The right-click menu after an update
Today (explorer-menu.js `install`): a silent install keeps the Windows 11 menu package only if Windows still starts
it; if not, it cannot show the permission prompt, so it falls back to the classic menu ("Show more options") and records
`Mode=classic` with `Declined` unchanged. Updates through electron-updater are silent, so this case can now happen
without anyone noticing.
- On start (packaged, Windows 11 build ≥ 22000, the .msix is present): if the recorded mode is `classic` and the user
  has never said No (`Declined` ≠ 1), the app offers, in its own box, after What's new and before the update box:
  "The right-click menu needs to be set up again." — detail "Windows will ask for permission once. Without it, Sastra
  PDF's items stay under 'Show more options'." — **Not now** / **Set up**.
  - Set up → the same elevation as the installer (`--explorer-menu=add-package` through UAC), then the same state
    writes as `install`. A short toast says whether it worked. UAC answered No → `Declined=1`, as today.
  - Not now → not asked again for this version (*my call:* remembered per version, so the next update asks once more).
- This only reads the registry state (fast). It does not run `packageWorks` (PowerShell, ~1 s) at every start.

### Text changes
- README: Download section → the fixed R2 link (GitHub releases stay as a backup); the privacy policy says the only
  thing the app does online by itself is check `https://sastra-update.smith89k.com/` for a newer version, which sends nothing
  about the user or their files; "Works fully offline" → still true, updates are optional.
- About screen CREDITS: a row for electron-updater (version, electron-builder authors, MIT, link);
  scripts/check-credits.js maps it so a version change is caught.
- docs/updates-setup.md: Cloudflare and GitHub setup click by click, how to check the bucket from a browser, how to
  release, what to do if a key leaks (new R2 token → update two secrets; installed copies are unaffected because they
  hold no key).
- CLAUDE.md: the release process, the privacy rule ("sends nothing anywhere on its own" now has the update-check
  exception), the new files.
- The first version released this way gets a What's new line about automatic updates. *Version number: the user's
  choice at release time* (1.1.0 was never published, so it can still be 1.1.0).

## Testing (the builder plans the details)
- Pure parts (what box to show when, the menu-repair rule, workflow name checks) get unit tests.
- The boxes get Playwright checks from source with main's update events faked (no network).
- **A real update must be seen working before this is called done:** an installed older build updating itself to a
  newer one from a real address (a test folder in the R2 bucket or a local web server — builder's call), including:
  Later then close → new version on next start; Restart now with an unsaved PDF → the question, Cancel keeps the work;
  the right-click menu still works afterwards (or the repair box appears and works).
- The first real release run on GitHub is itself a check (it also proves the billing block is gone).

## Left to the builder
How the main-process code is split into modules, the IPC names, the exact log format, how the "Checking…" box is drawn
with the existing `.modal.ask` styles, the test harness, and whether Restart now waits for or refuses during a task
window job.

## Later (not now)
- Code signing (SignPath or a certificate): sign the installer before upload; then electron-updater can also check the
  signature of downloaded updates (`publisherName`).

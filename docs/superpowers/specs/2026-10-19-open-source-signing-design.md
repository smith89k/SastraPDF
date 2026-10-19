# Open source and free code signing (SignPath) — design

Date: 2026-10-19 · Status: approved by the user in chat ("please go open source like bohpum to get code-signing" →
GPL 3.0 like Bohpum → clean both the work-document words and the Gmail address from the history → public downloads
are fine → "Yes, go ahead")

## Why
Windows SmartScreen warns about the unsigned installers. SignPath Foundation signs open-source projects for free (the
certificate is SignPath Foundation's, shown as the publisher). Its terms (signpath.org/terms): an OSI license, already
released, built from the public source on CI, a **Code signing policy** and a privacy statement on the project page,
MFA for every team member, every signing approved by hand, product name and version in the signed files, an
uninstaller. Bohpum (the sister app) did the same on 2026-10-19; Sastra follows its design and workflow.

## Starting point
The repository `smith89k/SastraPDF` is private, with releases v1.0.0–v1.1.2 and six Actions secrets. PR #4
(2026-10-15) already added an MIT license file, the Code signing policy and the privacy statement to the README (it
says "Applied for", which is not true yet). History holds no PDFs and no keys, but: the names of the user's work
documents in old versions of CLAUDE.md and docs/HISTORY.md (removed from the files by PR #5, still in old commits), and
the user's Gmail address as author/committer of 112 commits, as tagger of v1.0.0–v1.0.3 and inside 9 versions of
docs/updates-setup.md (the Cloudflare account line).

## 1. License: GPL-3.0-or-later (like Bohpum)
`LICENSE` = the GPL 3.0 text (Bohpum's file). package.json `license: GPL-3.0-or-later`, `repository`, `homepage`.
About gets, under the sastra note, "Free software under the GNU GPL 3.0 or later, with no warranty. Source code on
GitHub" (GPL 3.0 §5(d)), links in the accent colour. Every shipped part stays compatible: pdf.js (Apache-2.0),
pdf-lib, pako, Electron, electron-updater (MIT and friends), fonts (OFL), Liberation Sans (GPL-2.0 + font exception,
inside pdf.js, separate work).

## 2. Clean the history
- First `git bundle create E:\_httdocs\SastraPDF-old-history.bundle --all` (stays on this PC only).
- `git filter-branch` over every branch and tag: an index filter rewrites CLAUDE.md, docs/HISTORY.md and
  docs/updates-setup.md in each commit (the work-document names → the wording the files use now; the Cloudflare
  account line loses the address); an env filter turns the Gmail address into GitHub's private address
  `7828470+smith89k@users.noreply.github.com` (names unchanged; the two `docker` commits and GitHub's web-merge
  committer stay as they are). The four annotated tags are made again with the private tagger address and their own
  messages. The phrases to replace live only in the scratchpad script, never in the repository or a commit message.
- Checks: no Gmail and no work-document name in any blob, commit message or tag of any ref; the tree of the new `main`
  equals the old `main` except for those lines; `refs/original` dropped, reflog expired, `git gc --prune=now`.
- This repository's own `user.email` becomes the private address, so new commits don't bring Gmail back.

## 3. Release workflow: five jobs, signing once SignPath is set up (Bohpum's)
- **check** (ubuntu, the R2 key and GitHub token, installs nothing): version = package.json, not released yet, six
  secrets, the installer not already in R2 (`r2_has`: only a real 404 means absent), then — before anything is built —
  the address refuses requests without the update key and lets it in (200 or 404).
- **build** (windows, no R2 key, no GitHub token; only the update key, in the one step that writes
  update-config.json): install, check-notes, the menu, the installer, checks it made installer + blockmap + latest.yml.
  Uploads `installer` (those three) and, only when the repository variable `SIGNPATH_ORGANIZATION_ID` is set,
  `installer-unsigned` (the .exe alone) with its artifact id as a job output.
- **sign** (ubuntu, only `SIGNPATH_API_TOKEN`, nothing installed, `actions: read`, only when the variable is set):
  `signpath/github-action-submit-signing-request@v3`, project `SastraPDF`, policy `release-signing`, waits up to 6 h for
  the approval, uploads `installer-signed`.
- **rehash** (ubuntu, no keys): `pnpm install --ignore-scripts`, `scripts/rehash-installer.js signed/$EXE dist` — the
  signed file replaces the unsigned one, its blockmap and latest.yml's SHA-512 and size are made again with
  electron-builder's own `buildBlockMap` (installed copies check both); refuses a file with no Authenticode
  certificate table, or one latest.yml doesn't name. Uploads `installer-final`.
- **publish** (ubuntu, R2 key + GitHub token, installs nothing, `contents: write`): runs when check and build succeeded
  and either SignPath is not set up (sign skipped) or rehash succeeded — never unsigned once signing is on, never after
  a cancel. Takes `installer-final` when there is one. Upload (installer, blockmap, latest.yml last), lock check,
  prune, GitHub release. Notes: What's new, "Download the installer below and run it: copies installed from it update
  themselves.", the SHA-256, "Free and open source (GNU GPL 3.0). Code signing policy" (link to the README section).
- `scripts/r2-put.sh` holds `put` (upload + size check, moved out of the workflow) and `r2_has`; `.gitattributes`
  keeps `*.sh` LF (the Windows runner checks out with autocrlf).
Only the installer is signed (what SmartScreen checks); Sastra PDF.exe and the menu DLL/package inside stay unsigned.
`win.publisherName` stays unset, so electron-updater doesn't check the publisher of updates.

## 4. Version 1.1.3
What's new: New — open source on GitHub under the GPL 3.0, About links to it; Improved — releases are ready for a free
signature from SignPath Foundation.

## 5. README, docs/updates-setup.md, CLAUDE.md, HISTORY.md
README: open-source intro, **Download** (public Releases page, SmartScreen steps until signed), **Build from source**
(git clone, pnpm, `pnpm test`), **Releasing** (+ approve in SignPath), **Code signing policy** (what is signed, roles,
"until SignPath Foundation accepts the project, releases are not signed"), **Privacy** (the update check is the only
exception), **License** (GPL + third-party parts), project layout. updates-setup.md: the repository and its releases
are public, the lock now only keeps out requests that don't come from an installed copy, the key is in public
installers, new section "Code signing (SignPath Foundation)" (MFA, apply, project/policy/artifact configuration, the
variable and the secret, approving), the five jobs; no Gmail. CLAUDE.md and HISTORY.md: what changed.

## 6. Tests (now in the repository)
The old test folders lived in session scratchpads, and the one with the release tests is gone. New `tests/` with
`node --test` (`pnpm test`): `tests/rehash-installer.test.js` (PE headers in memory only — no made-up program on disk,
virus scanners remove them; the blockmap equal to electron-builder's; latest.yml lines replaced; refusals leave dist
alone; the command line prints `::error::`) and `tests/release-workflow.test.js` (the five jobs and their needs, who
sees which secret, the SignPath condition, publish's `if`, the order of uploads, `r2_has` run in bash with a stand-in
aws, `.gitattributes`). The About line is checked once in the real app with Playwright (scratchpad).

## 7. Going public (the user's yes first)
After everything passes: rewrite the history, force-push `main` and the seven tags, check the seven releases still
point at their tags. GitHub keeps the six merged pull requests, and their pages show the old commits (PR #5's diff
shows the work-document names; all show Gmail): only GitHub Support can remove them. The user chooses at that point:
make the repository public at once, or first ask GitHub Support to remove the pull requests and cached views. Releasing
1.1.3 is a separate yes.

## The user does
Turn on GitHub two-step login; say yes before the force-push / going public and before the 1.1.3 release; apply at
signpath.org/apply once the repository is public with a release built from it; then set the variable
`SIGNPATH_ORGANIZATION_ID` and the secret `SIGNPATH_API_TOKEN`; approve each signing request.

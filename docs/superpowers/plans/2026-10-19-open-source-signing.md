# Open source and SignPath signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sastra PDF public and GPL-3.0 in its one repository, with the release workflow ready for SignPath
Foundation's free signing, so SmartScreen stops warning about the installer.

**Architecture:** see `docs/superpowers/specs/2026-10-19-open-source-signing-design.md`. The workflow, the rehash script,
r2-put.sh and the two test files are ported from Bohpum (E:\_httdocs\Bohpum, commits 8ce82a9 and 89c066c), minus the
reader pack; Bohpum's tests use its own Electron harness, Sastra's use `node --test`.

**Tech Stack:** GitHub Actions (bash), Node 24 (`node:test`), electron-builder 26.15.3's `buildBlockMap`, git filter-branch.

## Global Constraints
- License `GPL-3.0-or-later`; one repository `smith89k/SastraPDF`; version **1.1.3** dated 2026-10-19.
- SignPath project slug `SastraPDF`, signing policy `release-signing`, variable `SIGNPATH_ORGANIZATION_ID`, secret
  `SIGNPATH_API_TOKEN`.
- Private address `7828470+smith89k@users.noreply.github.com`. The work-document names never appear in the repository,
  a commit message or this plan; the rewrite script lives in the session scratchpad.
- Never run a release, force-push or make the repository public without the user's yes.
- Commit on `main`; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. pnpm, not npm.
  Clear `ELECTRON_RUN_AS_NODE` before launching Electron.

### Task 1: GPL 3.0 and the About line
**Files:** `LICENSE` (= E:\_httdocs\Bohpum\LICENSE), `package.json` (license, repository, homepage),
`app/index.html` (About: `<p class="note license">` after the sastra note; CSS `.about .license a{color:var(--accent)}`).
- [ ] Copy the license, edit package.json and About.
- [ ] Playwright in the scratchpad: About shows "Free software under the GNU GPL 3.0 or later, with no warranty" with
  the links `https://www.gnu.org/licenses/gpl-3.0.html` and `https://github.com/smith89k/SastraPDF`; no console errors.
- [ ] Commit.

### Task 2: Signing in the release workflow (TDD)
**Files:** create `tests/rehash-installer.test.js`, `tests/release-workflow.test.js`, `scripts/rehash-installer.js`,
`scripts/r2-put.sh`, `.gitattributes`; modify `.github/workflows/release.yml`, `package.json` (`"test": "node --test tests/"`).
**Interfaces:** `rehash-installer.js` exports `hasSignature(buf) → boolean` and
`rehash(signed, dist, isSigned = hasSignature) → Promise<{ size, sha512 }>`; CLI `node scripts/rehash-installer.js
<signed exe> <dist>` prints `::error::…` and exits 1 on a refusal. r2-put.sh: `put <file> <key> [opts]`, `r2_has <key>`.
- [ ] Write both tests (ported from Bohpum's, node:test); `pnpm test` FAILS (no script, old workflow).
- [ ] Write the script, r2-put.sh, .gitattributes, the five-job workflow.
- [ ] `pnpm test` PASSES; `bash -n` on every `run:` block (extracted) passes.
- [ ] Commit.

### Task 3: 1.1.3, README, setup guide, CLAUDE.md, HISTORY.md
- [ ] `pnpm version 1.1.3 --no-git-tag-version --no-git-checks`; app/notes.js entry; `node scripts/check-notes.js` OK;
  `node scripts/release-notes.js 1.1.3` prints both notes.
- [ ] README and docs/updates-setup.md rewritten as the spec says (no Gmail); CLAUDE.md and HISTORY.md updated.
- [ ] `pnpm test` PASSES. Commit.

### Task 4: Clean the history (user's yes first, together with going public)
- [ ] `git bundle create E:\_httdocs\SastraPDF-old-history.bundle --all`; `git bundle verify`.
- [ ] Scratchpad script: `git filter-branch --env-filter <Gmail → private> --index-filter <rewrite the three docs>
  --tag-name-filter cat -- --all`; remake the four annotated tags with the private tagger; drop `refs/original`,
  expire the reflog, `git gc --prune=now`.
- [ ] Checks: no Gmail / work-document name in any blob, message or tag of `--all`; `git diff <old main> main` shows only
  the rewritten lines; seven tags; `pnpm test` still passes.
- [ ] Force-push `main` and the tags; the seven releases still point at their tags; make the repository public (or
  wait for GitHub Support to remove the pull requests, the user's choice).

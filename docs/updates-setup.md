# Releases and automatic updates — setup

Installed copies of Sastra PDF check **https://sastra-update.smith89k.com/** when they start and every 6 hours. A new
version downloads quietly; the app then asks **Restart now** or **Later** (Later = it installs when the app is closed).

The address is locked with Cloudflare Access (since 1.1.1): only requests carrying Sastra PDF's own service token get
in; anyone else — a browser too — gets **403**. The release job builds the token into the app (`update-config.json`,
never committed), so every copy installed from a release installer updates itself. Since 1.1.3 the repository is
public (open source, GPL 3.0, for SignPath's free code signing), and so are its GitHub releases: people download the
installer there. The lock now only keeps out requests that don't come from an installed copy.

The files live in a Cloudflare R2 bucket. GitHub Actions builds each release and puts it there; only the release job
can upload or delete.

> **Never change the address** after a release: every installed copy has it built in (package.json
> `build.publish.url`), and copies would stop updating.

**Set up on 2026-10-17** (the author's Cloudflare account):
- R2 bucket `sastra-pdf-updates` (Asia-Pacific, Standard, r2.dev off), custom domain `sastra-update.smith89k.com`
  (CNAME added by Cloudflare).
- R2 Account API token `sastra-pdf-release` (Object Read & Write, `sastra-pdf-updates` only, no expiry) — the upload key.
- Zero Trust service token `sastra-pdf-updater` (non-expiring) — the update key inside the app.
- Zero Trust Access application `sastra-update` (self-hosted, `sastra-update.smith89k.com`) with one policy
  **Sastra PDF app only**: action **Service Auth**, include **Service Token = sastra-pdf-updater**.
- The six GitHub secrets.

The sections below are how it was done, for doing it again. AI Hub has its own bucket, tokens and Access application;
none of them is shared.

## 1. The bucket (Cloudflare R2) — once

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket** → name (it only goes into a GitHub secret).
   Location: Automatic.
2. Open the bucket → **Settings** → **Custom Domains** → **Add** → `sastra-update.smith89k.com` → Continue → Connect
   domain. (smith89k.com is on Cloudflare, so the DNS record is made for you.)
3. Same page: leave **Public Development URL (r2.dev)** **disabled**.

## 2. The upload key (R2) — once

1. **R2 Object Storage** → **API Tokens** (`…/r2/api-tokens`) → **Create Account API token**.
2. Name `sastra-pdf-release`, permission **Object Read & Write**, **Apply to specific buckets only** → the bucket.
   TTL: Forever. → Create.
3. Copy the **Access Key ID** and the **Secret Access Key** straight into GitHub (section 4) — the secret is shown once.

## 3. The lock (Cloudflare Access) — once

1. **Zero Trust** → **Access controls** → **Service credentials** → **Create Service Token** → name
   `sastra-pdf-updater`, duration **Non-expiring** (the default, 1 year, would stop every installed copy from updating a
   year later) → Generate token. Copy the **Client ID** and **Client Secret** straight into GitHub (section 4); the
   secret is shown once, and Cloudflare closes that box when you switch tabs — copy both first.
2. **Access controls** → **Applications** → **Create new application** → **Self-hosted and private** → Continue.
   Destination: subdomain `sastra-update`, domain `smith89k.com`. **Create new policy**: name `Sastra PDF app only`,
   action **Service Auth**, Include → **Service Token** → `sastra-pdf-updater` → Save policy. → Create.

## 4. GitHub secrets — once

GitHub → **smith89k/SastraPDF** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | the Cloudflare Account ID (in the dashboard's address bar) |
| `R2_BUCKET` | `sastra-pdf-updates` |
| `R2_ACCESS_KEY_ID` | the upload token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the upload token's Secret Access Key |
| `CF_ACCESS_CLIENT_ID` | the service token's Client ID |
| `CF_ACCESS_CLIENT_SECRET` | the service token's Client Secret |

## 5. Check it

    curl -I https://sastra-update.smith89k.com/latest.yml

**403** = locked (right). **200** would mean anyone can download: check the Access application. Every release also
checks this by itself, and that the update key opens it (step "The update address is locked, and opens with the key").

## 6. Releasing a version

1. `pnpm version 1.2.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write the version's entry at the top of `app/notes.js` (What's new) with today's date — the build refuses to run
   without it, and it becomes the GitHub release notes.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type `1.2.0` → Run
   (or `gh workflow run release.yml -f version=1.2.0`).
5. Once SignPath is set up (section 7): approve the signing request in SignPath when its email comes. The run waits
   up to 6 hours for it.

The job runs in five parts, each on its own fresh machine:
- **check** (the R2 key, installs nothing): the version matches package.json and isn't released yet, the six secrets
  are set, the installer isn't in the bucket from a stopped run, and — before anything is built — the address refuses
  requests without the update key and lets the key in.
- **build** (no R2 key, no GitHub token; only the update key, which goes into the app): installs, checks What's new,
  builds the right-click menu and the installer.
- **sign** and **rehash**, only once SignPath is set up: SignPath signs the installer after your approval; then the
  installer's `.blockmap` and `latest.yml`'s SHA-512 and size are made again from the signed file (installed copies
  check both).
- **publish** (the R2 key and the GitHub token, installs nothing): uploads to the bucket (installer first, `latest.yml`
  last), checks the address is locked and opens with the key, removes the older installers there (their small
  `.blockmap` files stay — an installed copy uses its own to download only what changed), and makes the GitHub release
  `v1.2.0` with the notes and the installer. Once SignPath is set up it releases only a signed installer: a refused,
  failed or timed-out signing stops here, nothing is uploaded, and the same version can be run again.

It stops with a plain message if the version doesn't match package.json, is already released, or a secret is missing.
If a run stops half-way after uploading (the installer is in the bucket but there's no GitHub release), the next run of
the same version refuses: bump the version and release again.

After the first update that reaches an installed copy, right-click a PDF in File Explorer and check that the Sastra PDF
items are still in the first menu (or that the app offered to set them up again and it worked).

## 7. Code signing (SignPath Foundation) — once

Windows SmartScreen warns about new installers that carry no signature. SignPath Foundation signs open-source projects
for free; the certificate is issued to SignPath Foundation, so Windows shows **SignPath Foundation** as the publisher.
Their conditions (https://signpath.org/terms): an OSI license, the project already released, built on GitHub from the
public code, the **Code signing policy** and **Privacy** sections in the README (done), every release approved by hand,
and **two-step login (MFA) on GitHub and on SignPath** for everyone in the project.

1. GitHub → Settings → Password and authentication → turn on **two-factor authentication** (if it is off).
2. Release one version from the public repository the normal way (section 6): SignPath wants a project that is
   already released.
3. Apply at **https://signpath.org/apply** with the repository `https://github.com/smith89k/SastraPDF`.
4. When they accept, in SignPath: the project is **`SastraPDF`**, linked to the repository, with GitHub.com as its
   trusted build system; the signing policy **`release-signing`** (approval by you); the artifact configuration signs
   the one `.exe` in the artifact (`<zip-file><pe-file path="*.exe" /></zip-file>`). Make an API token for a CI user
   that may submit to that policy.
5. GitHub → **smith89k/SastraPDF** → **Settings** → **Secrets and variables** → **Actions**:
   - **Variables** tab → `SIGNPATH_ORGANIZATION_ID` = your SignPath organization ID
   - **Secrets** tab → `SIGNPATH_API_TOKEN` = the API token (paste it straight from SignPath)
6. Release the next version. The run stops at **sign** until you approve the request in SignPath (you get an email);
   then the release has the signed installer. Check: right-click it → Properties → **Digital Signatures** shows
   SignPath Foundation.

Without the variable the job skips sign and rehash and releases unsigned, as before. To stop signing, delete the
variable. Only the installer is signed (what SmartScreen checks); `Sastra PDF.exe` and the right-click menu inside stay
unsigned for now.

## Good to know

- **Giving someone Sastra PDF:** send them the link to the Releases page
  (https://github.com/smith89k/SastraPDF/releases), or download the installer there and send them the file. Their copy
  updates itself from then on.
- **Copies without the key** — 1.0.x, 1.1.0 (released before the lock), anything built locally (`pnpm run dist`),
  `pnpm start`, the portable .exe — never update: install a release's installer once.
- **Windows SmartScreen** warns about the installer until it is code-signed (section 7): **More info** → **Run anyway**.
  Updates installed by the app don't show this.
- **What the app sends:** only the requests for `latest.yml`, the installer and its blockmap, with the update key.
  Nothing about the user or their files. Problems with a check go to `%TEMP%\Sastra PDF\update.log`, never shown.
- **The update key is inside every installer**, and the installers are public, so anyone could pull it out and
  download updates without installing Sastra PDF. Downloads from R2 cost nothing, so this is harmless. If it is ever
  abused: Zero Trust → Service credentials → refresh or replace `sastra-pdf-updater`, update the two `CF_ACCESS_*`
  secrets and release a new version — copies holding the old key stop updating and must install the new version by hand.
- **A leaked upload key:** delete the R2 token, make a new one (section 2), update `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY`. Installed copies don't hold it, so they keep updating.
- **Cost:** R2's free tier (10 GB stored, no charge for downloads) and Zero Trust's free plan cover this easily.

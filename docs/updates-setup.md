# Releases and automatic updates — setup

Installed copies of Sastra PDF check **https://sastra-update.smith89k.com/** when they start and every 6 hours. A new
version downloads quietly; the app then asks **Restart now** or **Later** (Later = it installs when the app is closed).

The address is **private** (since 1.1.1, the user's wish: "only people I give the file to can update"). It is locked
with Cloudflare Access: only requests carrying Sastra PDF's own service token get in; anyone else — a browser too —
gets **403**. The release job builds the token into the app (`update-config.json`, never committed), so every copy
installed from a release installer updates itself. There is no public download link: you give people the installer
yourself (it is on the GitHub release page, which only you can see — the repository is private).

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

The job checks the version, `store.json` (section 7) and the six secrets, puts the update key into the app, builds the
installer (with the right-click menu), then the Microsoft Store package without the key (and checks it), uploads the
installer to the bucket (installer first, `latest.yml` last), checks the address is locked and opens with the key,
removes the older installers there (their small `.blockmap` files stay — an installed copy uses its own to download
only what changed), and makes the GitHub release `v1.2.0` with the notes, the installer to hand out and the Store
package (`Sastra-PDF-Store-1.2.0.msix`, for Partner Center: section 7; never put in the bucket).
It stops with a plain message if the version doesn't match package.json, is already released, `store.json` is missing
or not valid, or a secret is missing.
If a run stops half-way after uploading (the installer is in the bucket but there's no GitHub release), the next run of
the same version refuses: bump the version and release again.

After the first update that reaches an installed copy, right-click a PDF in File Explorer and check that the Sastra PDF
items are still in the first menu (or that the app offered to set them up again and it worked).

## 7. The Microsoft Store

The Store version is the same Sastra PDF with no update key. Microsoft signs it, so Windows shows no warning, and the
Store keeps it up to date. Version 1.2.0 is the last one for installer copies; after Microsoft has published Sastra PDF,
releases make only the Store package.

**Once** (the developer account already exists, from Bohpum):
1. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve the name **Sastra PDF** (if it
   is taken, choose a close name — and change `displayName` in scripts/store-config.js to match).
2. Sastra PDF → **Product management** → **Product identity**. Copy four values into `store.json` at the top of the
   repository, then commit it (they are not secret):
   ```json
   {
     "identityName": "<Package/Identity/Name>",
     "publisher": "<Package/Identity/Publisher, CN=…>",
     "publisherDisplayName": "<Package/Properties/PublisherDisplayName>",
     "storeId": "<Store ID, 12 characters>"
   }
   ```
   The release refuses to run without it. (Done on 2026-10-19: `smith89k.SastraPDF`, Store ID `9P768LL4RTVP`.)
3. The first submission (after the release has made the package): **Pricing and availability** (Free; markets: all),
   **Properties** (category Productivity; **Privacy policy** → **Provide privacy policy text**: paste the privacy
   policy from `docs/store-listing.md` — no web page needed, as for Bohpum), **Age ratings** (the questionnaire: no
   violence, no user content shared, no purchases), **Store listings** (English: description, short description,
   features, keywords and copyright from `docs/store-listing.md`, the screenshots), **Submission options** → restricted
   capabilities: paste the `runFullTrust` text and the notes for certification from `docs/store-listing.md`.

**Each release:**
1. Release as in section 6.
2. Open the GitHub release `v<version>` and download `Sastra-PDF-Store-<version>.msix`.
3. Partner Center → Sastra PDF → **Start update** (or, the first time, the submission above) → **Packages** → drag the
   `.msix` in → wait until it says it is valid → **Submit to the Store**.
4. Microsoft checks it, usually in 1 to 3 days. Store users then get the update by themselves. If certification asks a
   question (most likely about `runFullTrust` or the right-click menu), answer it in **Notes for certification** and
   submit again.

**Trying the Store package on this PC first** (before a first submission, or after changing the manifest): in
PowerShell `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; $env:SASTRA_STORE_SIDELOAD='1'; pnpm run dist:store`,
then in an administrator PowerShell `Add-AppxPackage -Path dist-store\Sastra-PDF-Store-<version>.msix -AllowUnsigned`.
It installs as "Sastra PDF" (identity `SastraPDF.StoreTest`); remove it with
`Get-AppxPackage SastraPDF.StoreTest | Remove-AppxPackage`.

## Good to know

- **Giving someone Sastra PDF:** download the installer from the GitHub release page and send them the file. Their copy
  updates itself from then on.
- **Copies without the key** — 1.0.x, 1.1.0 (released before the lock), anything built locally (`pnpm run dist`),
  `pnpm start`, the portable .exe — never update: install a release's installer once.
- **Windows SmartScreen** warns about the installer because it isn't code-signed yet: **More info** → **Run anyway**.
  Updates installed by the app don't show this.
- **Without the warning:** the Microsoft Store version (section 7) is signed by Microsoft. Send people its Store link,
  https://apps.microsoft.com/detail/9P768LL4RTVP (it works once Microsoft has published the first submission), instead
  of the installer. The Store keeps their copy up to date.
- **What the app sends:** only the requests for `latest.yml`, the installer and its blockmap, with the update key.
  Nothing about the user or their files. Problems with a check go to `%TEMP%\Sastra PDF\update.log`, never shown.
- **The update key is inside every installer**, so anyone you give the file to could pull it out and download later
  versions too. That matches "only people I give the file to". If it leaks further: Zero Trust → Service credentials →
  refresh or replace `sastra-pdf-updater`, update the two `CF_ACCESS_*` secrets and release a new version — copies
  holding the old key stop updating and must install the new version by hand.
- **A leaked upload key:** delete the R2 token, make a new one (section 2), update `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY`. Installed copies don't hold it, so they keep updating.
- **Cost:** R2's free tier (10 GB stored, no charge for downloads) and Zero Trust's free plan cover this easily.

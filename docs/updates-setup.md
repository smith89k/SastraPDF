# Releases and automatic updates — setup

Installed copies of Sastra PDF check **https://sastra-update.smith89k.com/** when they start and every 6 hours. A new
version downloads quietly; the app then asks **Restart now** or **Later** (Later = it installs when the app is closed).
The same address is the download link people get:

**https://sastra-update.smith89k.com/Sastra-PDF-Setup.exe** (always the newest version)

The files live in a Cloudflare R2 bucket. GitHub Actions builds each release and puts it there. Anyone with the link
can download; only the release job can upload or delete.

> **Never change the address** after the first release: every installed copy has it built in (package.json
> `build.publish.url`), and copies would stop updating.

**Set up on 2026-10-17** (the author's Cloudflare account): bucket `sastra-pdf-updates` (Asia-Pacific,
Standard, r2.dev off), custom domain `sastra-update.smith89k.com` (CNAME added by Cloudflare), Account API token
`sastra-pdf-release` (Object Read & Write, `sastra-pdf-updates` only, no expiry), and the four GitHub secrets. The
sections below are how it was done, for doing it again.

## 1. The bucket (Cloudflare R2) — once

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**. Name it, for example, `sastra-pdf`
   (any name; it only goes into a GitHub secret). Location: Automatic.
2. Open the bucket → **Settings** → **Custom Domains** → **Connect Domain** → `sastra-update.smith89k.com` → Continue
   → Connect. (smith89k.com is already on Cloudflare, so the DNS record is made for you; it shows **Active** after a
   minute or two.)
3. Same page: leave **Public Development URL (r2.dev)** **disabled** (it is rate-limited and not meant for real use).

## 2. The upload key — once

1. **R2 Object Storage** → **API** → **Manage API tokens** → **Create Account API token** (or User API token).
2. Name `sastra-pdf-release`, permission **Object Read & Write**, **Apply to specific buckets only** → your bucket.
   TTL: Forever. → Create.
3. Copy the **Access Key ID** and the **Secret Access Key** now (the secret is shown only once), and the **Account ID**
   (on the R2 overview page, or in the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`).

## 3. GitHub secrets — once

GitHub → **smith89k/SastraPDF** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | the Account ID |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key |
| `R2_BUCKET` | the bucket's name, e.g. `sastra-pdf` |

## 4. Check it

    curl -I https://sastra-update.smith89k.com/latest.yml

**404** before the first release (the address works, nothing is there yet); **200** after it. An error such as
"Could not resolve host" means the custom domain isn't active yet.

## 5. Releasing a version

1. `pnpm version 1.2.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write the version's entry at the top of `app/notes.js` (What's new) with today's date — the build refuses to run
   without it, and it becomes the GitHub release notes.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type `1.2.0` → Run
   (or `gh workflow run release.yml -f version=1.2.0`).

The job checks the version, builds the installer (with the right-click menu), uploads it to the bucket (installer first,
`latest.yml` last), removes the older installers there (their small `.blockmap` files stay — an installed copy uses its
own to download only what changed), and makes the GitHub release `v1.2.0` with the notes and the installer.
It stops with a plain message if the version doesn't match package.json, is already released, or a secret is missing.
If a run stops half-way after uploading (the installer is in the bucket but there's no GitHub release), the next run of
the same version refuses: bump the version and release again.

After the first update that reaches an installed copy, right-click a PDF in File Explorer and check that the Sastra PDF
items are still in the first menu (or that the app offered to set them up again and it worked).

## Good to know

- **Copies installed before automatic updates** (1.0.x, and hand-built 1.1.0 copies) don't update themselves: install
  once from the link; later versions arrive by themselves.
- **Windows SmartScreen** warns about the downloaded installer because it isn't code-signed yet: **More info** → **Run
  anyway**. Updates installed by the app don't show this.
- **What the app sends:** only the requests for `latest.yml` and the installer. Nothing about the user or their files.
  Problems with a check (offline, address down) are written to `%TEMP%\Sastra PDF\update.log`, never shown.
- **Local builds** (`pnpm run dist`) carry the same address, so an installed local build updates from R2 too.
  `pnpm start` and the portable .exe never check.
- **A leaked upload key:** delete the token in Cloudflare, make a new one (section 2), update the two key secrets.
  Installed copies hold no key, so they keep updating.
- **Cost:** R2's free tier (10 GB stored, no charge for downloads) is far more than a ~115 MB installer needs.

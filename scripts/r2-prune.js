// Which old installers to delete from the R2 bucket after a release: every Sastra-PDF-Setup-<version>.exe except the new
// one, and the old public download copy Sastra-PDF-Setup.exe (the bucket is private since 1.1.1). Never latest.yml or any
// .blockmap (an installed copy uses its own version's blockmap to download only the parts that changed). Refuses when the
// new installer isn't listed, so a failed upload never leaves the bucket without an installer.
// `aws s3api list-objects-v2 … --query 'Contents[].[Key]' --output text | node scripts/r2-prune.js <new installer>`
// prints the keys to delete, one per line (run by .github/workflows/release.yml).
const INSTALLER = /^Sastra-PDF-Setup(-.+)?\.exe$/;

function pruneList(keys, keep) {
  const clean = keys.map(k => String(k).trim()).filter(Boolean);   // the Windows runner ends each line with \r
  if (!clean.includes(keep)) throw new Error(`${keep} is not in the bucket listing, so nothing was removed`);
  return clean.filter(k => INSTALLER.test(k) && k !== keep);
}

if (require.main === module) {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { text += d; });
  process.stdin.on('end', () => {
    try { for (const k of pruneList(text.split('\n'), process.argv[2])) console.log(k); }
    catch (e) { console.error('::error::' + e.message); process.exit(1); }
  });
}

module.exports = { pruneList };

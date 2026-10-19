// scripts/rehash-installer.js, run by the release job after SignPath signed the installer: the signature changes the
// installer's bytes, and installed copies check an update's SHA-512 and size (latest.yml) and download only its changed
// parts (the .blockmap). So the signed file replaces the unsigned one in dist/, and both are made again from it, the way
// electron-builder makes them. A file from SignPath without a signature is refused and dist/ stays as it was.
// No made-up program is ever written to disk: virus scanners remove them (Bohpum's test met Trend Micro's "Cryp_Xin1").
// The signature reader is checked on bytes in memory; the files on disk are plain text. (Ported from Bohpum.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');

const ROOT = path.join(__dirname, '..'), SCRIPT = path.join(ROOT, 'scripts', 'rehash-installer.js');
const EXE = 'Sastra-PDF-Setup-9.9.9.exe';

// The smallest PE header: MZ pointing at a PE32+ (or PE32) header whose certificate table (data directory 4, where
// Authenticode puts the signature) is empty, or names `sig` bytes appended at the end. In memory only.
function pe(sig, magic = 0x20b) {
  const head = Buffer.alloc(0x200, 0), body = Buffer.alloc(4096, 0);
  head.write('MZ', 0, 'latin1'); head.writeUInt32LE(0x80, 0x3c); head.write('PE\0\0', 0x80, 'latin1');
  head.writeUInt16LE(magic, 0x98);
  const dirs = 0x98 + (magic === 0x20b ? 112 : 96);
  head.writeUInt32LE(16, dirs - 4);                                            // 16 data directories
  if (sig) { head.writeUInt32LE(0x200 + body.length, dirs + 4 * 8); head.writeUInt32LE(sig, dirs + 4 * 8 + 4); }
  return Buffer.concat([head, body, Buffer.alloc(sig || 0, 0)]);
}
const sha512 = buf => crypto.createHash('sha512').update(buf).digest('base64');

function builderBlockMap() {
  const builderDir = path.dirname(require.resolve('electron-builder', { paths: [ROOT] }));
  return require(require.resolve('app-builder-lib/out/targets/blockmap/blockmap', { paths: [builderDir] })).buildBlockMap;
}

// a dist/ as the build leaves it (unsigned installer, an old blockmap, latest.yml naming it) and the file from SignPath
function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sastra-rehash-'));
  const dist = path.join(tmp, 'dist'), signedDir = path.join(tmp, 'signed');
  fs.mkdirSync(dist); fs.mkdirSync(signedDir);
  const unsignedBytes = Buffer.from('the unsigned installer '.repeat(20000)), signedBytes = Buffer.from('the signed installer '.repeat(25000));
  const latest = `version: 9.9.9\nfiles:\n  - url: ${EXE}\n    sha512: ${sha512(unsignedBytes)}\n    size: ${unsignedBytes.length}\npath: ${EXE}\nsha512: ${sha512(unsignedBytes)}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`;
  fs.writeFileSync(path.join(dist, EXE), unsignedBytes); fs.writeFileSync(path.join(dist, EXE + '.blockmap'), 'old');
  fs.writeFileSync(path.join(dist, 'latest.yml'), latest);
  const signed = path.join(signedDir, EXE);
  fs.writeFileSync(signed, signedBytes);
  const unchanged = () => fs.readFileSync(path.join(dist, EXE)).equals(unsignedBytes) && fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8') === latest
    && fs.readFileSync(path.join(dist, EXE + '.blockmap'), 'utf8') === 'old';
  return { tmp, dist, signedDir, signed, signedBytes, unsignedBytes, latest, unchanged };
}

test('The signature reader: a certificate table → signed (PE32+ and PE32); none, one past the end, or not a PE → not', () => {
  const { hasSignature } = require(SCRIPT);
  const lying = pe(null); lying.writeUInt32LE(0x200, 0x98 + 112 + 4 * 8); lying.writeUInt32LE(1e6, 0x98 + 112 + 4 * 8 + 4);
  assert.equal(hasSignature(pe(9000)), true);
  assert.equal(hasSignature(pe(9000, 0x10b)), true);
  assert.equal(hasSignature(pe(null)), false);
  assert.equal(hasSignature(pe(null, 0x10b)), false);
  assert.equal(hasSignature(lying), false);
  assert.equal(hasSignature(Buffer.from('MZ not really a program')), false);
  assert.equal(hasSignature(Buffer.alloc(0)), false);
});

test('The signed installer replaces the unsigned one, with latest.yml and the blockmap made again from it', async () => {
  const { rehash } = require(SCRIPT);
  const s = setup();
  const info = await rehash(s.signed, s.dist, () => true);
  assert.ok(fs.readFileSync(path.join(s.dist, EXE)).equals(s.signedBytes), 'the signed file is in dist');
  assert.equal(info.size, s.signedBytes.length);
  const yml = fs.readFileSync(path.join(s.dist, 'latest.yml'), 'utf8');
  assert.equal(yml, s.latest.split(sha512(s.unsignedBytes)).join(sha512(s.signedBytes))
    .replace(`size: ${s.unsignedBytes.length}`, `size: ${s.signedBytes.length}`), 'both SHA-512 lines and the size change; nothing else');
  const map = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(s.dist, EXE + '.blockmap'))));
  assert.ok(Array.isArray(map.files), 'a real blockmap');
  const want = path.join(s.tmp, 'want.blockmap'); await builderBlockMap()(s.signed, 'gzip', want);
  assert.ok(fs.readFileSync(path.join(s.dist, EXE + '.blockmap')).equals(fs.readFileSync(want)), 'the same blockmap electron-builder makes');
});

test('A file without a signature is refused, and dist stays as it was', async () => {
  const { rehash } = require(SCRIPT);
  const s = setup();
  await assert.rejects(rehash(s.signed, s.dist), /no signature/);
  assert.ok(s.unchanged());
});

test("A file latest.yml doesn't name is refused", async () => {
  const { rehash } = require(SCRIPT);
  const s = setup();
  const other = path.join(s.signedDir, 'Other.exe'); fs.writeFileSync(other, s.signedBytes);
  await assert.rejects(rehash(other, s.dist, () => true), /latest\.yml/);
  assert.ok(s.unchanged());
});

test('From the command line (as the release job runs it): a stop says why as a GitHub error line, exit 1', () => {
  const s = setup();
  const r = spawnSync(process.execPath, [SCRIPT, s.signed, s.dist], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 1, out);
  assert.match(out, /^::error::.*no signature/m);
  assert.ok(s.unchanged());
});

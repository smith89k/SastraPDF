// After SignPath signed the installer (release job "rehash"): the signature changes the installer's bytes, and installed
// copies check an update's SHA-512 and size (latest.yml) and download only its changed parts (the .blockmap). So the
// signed file replaces the unsigned one in <dist>, and its blockmap and latest.yml's SHA-512 and size are made again
// from it with electron-builder's own blockmap code. Refuses a file without a signature, or one latest.yml doesn't name.
// `node scripts/rehash-installer.js <signed installer> <dist>`; tests/rehash-installer.test.js. (From Bohpum.)
const fs = require('fs'), path = require('path');

// electron-builder's blockmap code, found through electron-builder (pnpm keeps app-builder-lib out of the top node_modules)
const builderDir = path.dirname(require.resolve('electron-builder'));
const { buildBlockMap } = require(require.resolve('app-builder-lib/out/targets/blockmap/blockmap', { paths: [builderDir] }));

// true when the PE file has a certificate table (data directory 4: where Authenticode puts the signature) inside the file
function hasSignature(buf) {
  if (buf.length < 0x40 || buf.toString('latin1', 0, 2) !== 'MZ') return false;
  const pe = buf.readUInt32LE(0x3c), opt = pe + 24;
  if (opt + 2 > buf.length || buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') return false;
  const magic = buf.readUInt16LE(opt), dirs = magic === 0x20b ? opt + 112 : magic === 0x10b ? opt + 96 : -1;
  if (dirs < 0 || dirs + 5 * 8 > buf.length || buf.readUInt32LE(dirs - 4) < 5) return false;
  const at = buf.readUInt32LE(dirs + 4 * 8), size = buf.readUInt32LE(dirs + 4 * 8 + 4);
  return size > 0 && at > 0 && at + size <= buf.length;
}

// isSigned: the tests pass their own, so they never write a made-up program to disk (virus scanners remove those)
async function rehash(signed, dist, isSigned = hasSignature) {
  const name = path.basename(signed), exe = path.join(dist, name), yml = path.join(dist, 'latest.yml');
  const text = fs.readFileSync(yml, 'utf8');
  if (!new RegExp(`^\\s*(- )?url: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?$`, 'm').test(text)) throw new Error(`latest.yml doesn't name ${name}`);
  if (!isSigned(fs.readFileSync(signed))) throw new Error(`${name} from SignPath has no signature`);
  fs.copyFileSync(signed, exe);
  const info = await buildBlockMap(exe, 'gzip', exe + '.blockmap');
  fs.writeFileSync(yml, text.replace(/^(\s*sha512: ).*$/gm, `$1${info.sha512}`).replace(/^(\s*size: ).*$/m, `$1${info.size}`));
  return info;
}

if (require.main === module) {
  const [signed, dist] = process.argv.slice(2);
  rehash(signed, dist).then(
    (i) => console.log(`${path.basename(signed)}: signed, ${i.size} bytes, SHA-512 ${i.sha512}; blockmap and latest.yml made again`),
    (e) => { console.error(`::error::${e.message}`); process.exit(1); });
}

module.exports = { hasSignature, rehash };

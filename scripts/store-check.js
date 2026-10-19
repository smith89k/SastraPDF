// After electron-builder made the Microsoft Store package (build/store.config.js): the app inside it has store.js and
// the menu DLL, and none of what only the installer may carry — the update key (anyone can download a Store package and
// open it), app-update.yml, the sparse menu package.
// `node scripts/store-check.js <dist-store> <msix name>`; run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path');

// The files in an Electron app.asar: its header is JSON after a 16-byte pickle head (the JSON's length at offset 12)
function asarFiles(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16);
    const out = [];
    const walk = (node, at) => { for (const [k, v] of Object.entries(node.files || {})) { const p = at ? at + '/' + k : k; if (v.files) walk(v, p); else out.push(p); } };
    walk(JSON.parse(json.toString('utf8')), '');
    return out;
  } finally { fs.closeSync(fd); }
}

// → the problems, in plain words (none = good)
function storeProblems(dist, msix) {
  const res = path.join(dist, 'win-unpacked', 'resources'), there = (...p) => fs.existsSync(path.join(...p)), problems = [];
  if (!there(dist, msix)) problems.push(`there is no ${msix}`);
  if (!there(res, 'explorer-menu', 'SastraMenu.dll')) problems.push('the menu DLL is not inside (resources/explorer-menu/SastraMenu.dll)');
  if (there(res, 'explorer-menu', 'SastraPDF.ExplorerMenu.msix')) problems.push('the sparse menu package is inside (the Store package has its own menu)');
  if (there(res, 'app-update.yml')) problems.push('app-update.yml is inside (the Store updates this copy)');
  let files = [];
  try { files = asarFiles(path.join(res, 'app.asar')); } catch (e) { problems.push('app.asar could not be read: ' + e.message); }
  if (files.length && !files.includes('store.js')) problems.push('store.js is not inside (main.js needs it)');
  if (files.includes('update-config.json') || there(res, 'app', 'update-config.json')) problems.push('the update key (update-config.json) is inside');
  return problems;
}

if (require.main === module) {
  const [dist, msix] = process.argv.slice(2);
  if (!dist || !msix) { console.error('Usage: node scripts/store-check.js <dist-store> <msix name>'); process.exit(2); }
  const problems = storeProblems(path.resolve(dist), msix);
  for (const p of problems) console.error('::error::Store package: ' + p);
  if (problems.length) process.exit(1);
  console.log(`store-check: ${msix} has the menu and store.js, and no update key`);
}

module.exports = { asarFiles, storeProblems };

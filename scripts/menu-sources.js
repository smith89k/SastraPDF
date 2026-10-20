// The right-click menu is declared in three places that must agree with explorer-menu.js — menu.cpp (the DLL),
// explorer-menu/AppxManifest.xml (the installer's sparse package) and build/store-manifest.xml (the Microsoft Store
// package): the same CLSID, the same file types, the same task names, each manifest's DLL path, the sparse package's name and version.
// Nothing is built here; scripts/build-explorer-menu.js stops on the first problem.
const MANIFESTS = [
  ['explorer-menu/AppxManifest.xml', 'sparse', 'resources\\explorer-menu\\SastraMenu.dll'],
  ['build/store-manifest.xml', 'store', 'app\\resources\\explorer-menu\\SastraMenu.dll']
];

// → the problems, in plain words (none = good)
function menuProblems({ cpp, sparse, store, CLSID, PKG, PKG_VERSION, EXTS, TASKS = [] }) {
  const id = CLSID.slice(1, -1).toLowerCase(), xmls = { sparse, store }, problems = [];
  if (!cpp.toLowerCase().includes(`uuid("${id}")`)) problems.push(`menu.cpp does not use ${CLSID}`);
  for (const e of EXTS) if (!cpp.includes(`L"${e}"`)) problems.push(`menu.cpp does not handle ${e}`);
  for (const t of TASKS) if (!cpp.includes(`L"${t}"`)) problems.push(`menu.cpp has no "${t}" task (explorer-menu.js TASKS)`);
  for (const [name, key, dll] of MANIFESTS) {
    const xml = xmls[key];
    const types = [...xml.matchAll(/<desktop5:ItemType Type="([^"]+)">\s*<desktop5:Verb Id="SastraPDF" Clsid="([^"]+)" \/>/g)];
    if (types.map(t => t[1]).join(' ') !== EXTS.join(' ') || types.some(t => t[2].toLowerCase() !== id))
      problems.push(`${name} needs one ItemType per file type (${EXTS.join(' ')}), each with ${CLSID}`);
    if (!xml.toLowerCase().includes(`<com:class id="${id}" path="${dll.toLowerCase()}"`)) problems.push(`${name}'s COM class must be ${CLSID} at ${dll}`);
  }
  if (!sparse.includes(`Name="${PKG}"`) || !sparse.includes(`Version="${PKG_VERSION}"`)) problems.push(`explorer-menu/AppxManifest.xml must be ${PKG} ${PKG_VERSION}`);
  return problems;
}

module.exports = { menuProblems };

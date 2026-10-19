// The electron-builder config of the Microsoft Store package, made from the installer's own (package.json "build"): no
// update key inside (anyone can download a Store package and open it, and the Store updates this copy), the menu DLL
// without its sparse package (the package manifest has the menu: build/store-manifest.xml), the appx target, into
// dist-store\. build/store.config.js hands it the identity. No Electron here.
const NOT_IN_STORE = Object.freeze(['update-config.json']);

// id: { identityName, publisher, publisherDisplayName } (store.js); storeJson: carry store.json (its Store ID, for
// Check for Updates; a sideloaded test package has none)
function storeBuildConfig({ base, id, storeJson }) {
  return {
    ...base,
    directories: { ...(base.directories || {}), output: 'dist-store' },
    files: [...base.files.filter(f => !NOT_IN_STORE.includes(f)), ...(storeJson ? ['store.json'] : [])],
    extraResources: [{ from: 'explorer-menu/out', to: 'explorer-menu', filter: ['SastraMenu.dll'] }],
    win: { ...base.win, target: 'appx' },
    publish: null,   // no app-update.yml: the Store updates this copy
    appx: {
      identityName: id.identityName, publisher: id.publisher, publisherDisplayName: id.publisherDisplayName,
      applicationId: 'SastraPDF', displayName: 'Sastra PDF', backgroundColor: 'transparent', languages: ['en-US'],
      minVersion: '10.0.19041.0', maxVersionTested: '10.0.26100.0',   // the menu's FileExplorerContextMenus needs 2004+
      customManifestPath: 'build/store-manifest.xml',
      artifactName: 'Sastra-PDF-Store-${version}.msix'   // electron-builder's ext is appx: the same format, under its newer name
    }
  };
}

module.exports = { NOT_IN_STORE, storeBuildConfig };

// Sastra PDF — the Microsoft Store copy: an MSIX package that Microsoft signs and the Store updates (design:
// docs/superpowers/specs/2026-10-19-microsoft-store-design.md). It has no update key and gets its right-click menu and
// the .pdf "Open with" entry from its package manifest (build/store-manifest.xml). No Electron here: main.js and
// build/store.config.js use it, so the rules are plain-Node testable.
const fs = require('fs');

// store.json = Partner Center › Product identity: { identityName, publisher, publisherDisplayName, storeId } → that,
// or null when anything is off. Not secret: anyone can read it in the Store package.
function parseStoreInfo(text) {
  let c; try { c = JSON.parse(text); } catch { return null; }
  const { identityName, publisher, publisherDisplayName, storeId } = c || {};
  if (typeof identityName !== 'string' || !/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) return null;
  if (typeof publisher !== 'string' || !/^CN=./.test(publisher)) return null;
  if (typeof publisherDisplayName !== 'string' || !publisherDisplayName.trim()) return null;
  if (typeof storeId !== 'string' || !/^[0-9A-Z]{12}$/.test(storeId)) return null;
  return { identityName, publisher, publisherDisplayName, storeId };
}
function readStoreInfo(file) { try { return parseStoreInfo(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// A test package for this PC, installed with Add-AppxPackage -AllowUnsigned: Windows takes an unsigned package only
// with this OID in Publisher (as explorer-menu/AppxManifest.xml). Never sent to the Store, so it has no Store ID.
const SIDELOAD = Object.freeze({
  identityName: 'SastraPDF.StoreTest', publisher: 'CN=Sastra PDF, OID.2.25.311729368913984317654407730594956997722=1',
  publisherDisplayName: 'Sunnguon Taing', storeId: null
});

// Windows sets process.windowsStore in an app started from its MSIX package; tests say so with SASTRA_STORE_TEST.
function isStoreCopy({ windowsStore, test = false }) { return windowsStore === true || test === true; }

// The update panel's Open in Store button (app/update-panel.js): Sastra PDF's page in the Store app, or the Store's
// Downloads and updates when the copy has no Store ID (the sideloaded test package).
function storePageUrl(info) {
  return info && info.storeId ? `ms-windows-store://pdp/?ProductId=${info.storeId}` : 'ms-windows-store://downloadsandupdates';
}

module.exports = { parseStoreInfo, readStoreInfo, SIDELOAD, isStoreCopy, storePageUrl };

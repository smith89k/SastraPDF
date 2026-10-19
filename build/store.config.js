// electron-builder loads this for the Microsoft Store package: `pnpm run dist:store`, and the release job
// (.github/workflows/release.yml). The rules: scripts/store-config.js. The identity is store.json (Partner Center ›
// Product identity, docs/updates-setup.md section 7); SASTRA_STORE_SIDELOAD=1 makes the unsigned test package for this
// PC instead (store.js SIDELOAD).
const path = require('path');
const store = require('../store');
const { storeBuildConfig } = require('../scripts/store-config');

const sideload = process.env.SASTRA_STORE_SIDELOAD === '1';
const id = sideload ? store.SIDELOAD : store.readStoreInfo(path.join(__dirname, '..', 'store.json'));
if (!id) throw new Error('store.json is missing or not valid: put Partner Center › Product identity in it (docs/updates-setup.md section 7), or set SASTRA_STORE_SIDELOAD=1 for a test package');

module.exports = storeBuildConfig({ base: require('../package.json').build, id, storeJson: !sideload });

// Sastra PDF — automatic updates: when the installed app checks https://sastra-update.smith89k.com/ (package.json
// build.publish), and what it tells the page. No Electron here: main.js hands in electron-updater's autoUpdater, so
// the rules are plain-Node testable. A new version downloads quietly; the page asks Restart now / Later in its own box,
// and an update not installed by Restart now installs when the app is closed.
const fs = require('fs'), path = require('path');

const FIRST_CHECK_MS = 10000;              // not while the window and its files are still opening
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// Only the installed Windows app updates itself: not `pnpm start`, not the portable .exe, and not the Microsoft Store
// copy (the Store updates it; store.js).
function updatesRunHere({ packaged, platform, portable, store = false }) { return packaged === true && platform === 'win32' && !portable && store !== true; }

// What Help > Check for Updates says → { kind, version }
function checkAnswer({ downloaded, result, error, current }) {
  if (downloaded) return { kind: 'ready', version: downloaded };
  if (error || !result) return { kind: 'failed' };
  if (result.isUpdateAvailable) return { kind: 'downloading', version: result.updateInfo.version };
  return { kind: 'current', version: current };
}

// Why Restart now can't install yet: nothing downloaded, or a right-click job is running in the task window.
function installBlock({ downloaded, taskOpen }) { return !downloaded ? 'none' : taskOpen ? 'task' : null; }

// The update address is locked with Cloudflare Access: only requests carrying Sastra's service token get in. The
// release job writes the token into update-config.json inside the app ({ clientId, clientSecret }; never committed),
// so copies installed from a release update themselves and a copy built without it never checks.
function parseUpdateConfig(text) {
  let c; try { c = JSON.parse(text); } catch { return null; }
  const { clientId, clientSecret } = c || {};
  return [clientId, clientSecret].every(v => typeof v === 'string' && v) ? { clientId, clientSecret } : null;
}
function readUpdateConfig(file) { try { return parseUpdateConfig(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// %TEMP%\Sastra PDF\update.log: offline and broken checks are only written here, never shown.
function logTo(file) {
  return msg => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\r\n`); } catch {} };
}

function createUpdater({ updater, current, send, log, timers = { setTimeout, setInterval }, key = null }) {
  const say = m => log(String(m && m.message || m));
  // on every request (latest.yml, the installer, the blockmaps): the lock lets only this key in
  if (key) updater.requestHeaders = { 'CF-Access-Client-Id': key.clientId, 'CF-Access-Client-Secret': key.clientSecret };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: say, warn: say, error: say, debug() {} };
  let downloaded = null;
  updater.on('update-downloaded', info => {
    const v = info && info.version;
    if (!v || v === downloaded) return;
    downloaded = v;
    try { send('update-ready', v); } catch (e) { log('update-ready not shown: ' + e.message); }   // window closed: installs on quit anyway
  });
  updater.on('error', e => say(e));
  const check = () => updater.checkForUpdates().catch(e => log('check: ' + e.message));
  timers.setTimeout(check, FIRST_CHECK_MS);
  timers.setInterval(check, CHECK_EVERY_MS);
  return {
    async checkNow() {
      if (downloaded) return checkAnswer({ downloaded, current });
      try { return checkAnswer({ result: await updater.checkForUpdates(), current }); }
      catch (error) { log('check: ' + error.message); return checkAnswer({ error, current }); }
    },
    // Silent, then start the new version. → whether the installer started: electron-updater leaves quitAndInstallCalled
    // set only then (it quits the app a moment later). If not, forget this download and fetch it again.
    install() {
      updater.quitAndInstall(true, true);
      if (updater.quitAndInstallCalled === true) return true;
      log('install did not start; checking again');
      downloaded = null; check();
      return false;
    },
    downloaded: () => downloaded
  };
}

module.exports = { FIRST_CHECK_MS, CHECK_EVERY_MS, updatesRunHere, checkAnswer, installBlock, parseUpdateConfig, readUpdateConfig, logTo, createUpdater };

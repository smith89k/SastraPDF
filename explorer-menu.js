// Sastra PDF — File Explorer right-click menu for PDFs and pictures: registering it (installer hooks, see build/installer.nsh) and
// reading what a menu click asked for (--sastra-task / --sastra-list). No Electron here: plain-Node testable.
// Windows 11: the unsigned sparse package SastraPDF.ExplorerMenu (first menu; adding it needs admin once).
// Windows 10, silent installs and any failure: classic HKCU keys (Windows 11: under "Show more options").
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const PKG = 'SastraPDF.ExplorerMenu';
const PKG_VERSION = '1.0.0.0';        // = explorer-menu/AppxManifest.xml (the build script checks)
const CLSID = '{47a2af3d-bd25-4ebd-949f-d0e6b6bd5004}';
const CLASSES = 'HKCU\\Software\\Classes';
const STATE_KEY = 'HKCU\\Software\\Sastra PDF\\ExplorerMenu';
const TASKS = ['combine', 'split-here', 'split-folder', 'images-here', 'images-folder'];
// The file types the menu is shown for: = the ItemTypes in AppxManifest.xml and the list in menu.cpp (the build script checks)
const EXTS = ['.pdf', '.jpg', '.jpeg', '.jfif', '.png', '.bmp', '.gif', '.webp'];
const LIST_DIR = () => path.join(os.tmpdir(), 'Sastra PDF');

/* ---------- what a menu click asked for ---------- */
function parseTaskArgs(argv) {
  const get = k => { const a = argv.find(x => typeof x === 'string' && x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };
  const task = get('--sastra-task'), list = get('--sastra-list');
  return TASKS.includes(task) && list ? { task, list } : null;
}

const real = p => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return null; } };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// The list file written by SastraMenu.dll: UTF-8, one path per line. Only %TEMP%\Sastra PDF\menu-*.txt is read
// (and then deleted), so the switch can't be used to delete other files. Returns existing PDFs and pictures
// (EXTS) in name order — 01, 02, 10, like Explorer (the menu hands them over in its own order).
function readTaskList(file, tempDir = LIST_DIR()) {
  const f = path.resolve(String(file));
  if (!/^menu-[\w-]+\.txt$/i.test(path.basename(f))) return [];
  const dir = real(path.dirname(f));
  if (!dir || dir !== real(tempDir)) return [];
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return []; }
  try { fs.unlinkSync(f); } catch {}
  const seen = new Set();
  return text.replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).filter(p => {
    if (!p || !EXTS.includes(path.extname(p).toLowerCase()) || !path.isAbsolute(p)) return false;
    const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k);
    try { return fs.statSync(p).isFile(); } catch { return false; }
  }).sort((a, b) => collator.compare(path.basename(a), path.basename(b)) || collator.compare(a, b));
}

/* ---------- helpers ---------- */
const run = (exe, args) => spawnSync(exe, args, { encoding: 'utf8', windowsHide: true });
const reg = (...args) => run('reg.exe', args);
const ps = script => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
const psq = s => "'" + String(s).replace(/'/g, "''") + "'";   // PowerShell single-quoted string
function log(msg) {
  try { fs.mkdirSync(LIST_DIR(), { recursive: true }); fs.appendFileSync(path.join(LIST_DIR(), 'explorer-menu.log'), `${new Date().toISOString()} ${msg}\r\n`); } catch {}
}
function windowsBuild() { const m = /^10\.0\.(\d+)/.exec(os.release()); return m ? +m[1] : 0; }

/* ---------- classic menu (HKCU) ---------- */
const verbKey = (classes, ext) => `${classes}\\SystemFileAssociations\\${ext}\\shell\\SastraPDF`;
const clsidKey = classes => `${classes}\\CLSID\\${CLSID}`;
function registerClassic(dll, classes = CLASSES) {
  const steps = [
    [clsidKey(classes), '/ve', '/d', 'Sastra PDF Explorer menu'],
    [clsidKey(classes) + '\\InprocServer32', '/ve', '/d', dll],
    [clsidKey(classes) + '\\InprocServer32', '/v', 'ThreadingModel', '/d', 'Apartment'],
    ...EXTS.flatMap(ext => [
      [verbKey(classes, ext), '/v', 'ExplorerCommandHandler', '/d', CLSID],
      [verbKey(classes, ext), '/v', 'MultiSelectModel', '/d', 'Player']   // shown for more than 15 files too
    ])
  ];
  for (const [key, ...rest] of steps) if (reg('add', key, ...rest, '/f').status !== 0) return false;
  return true;
}
function unregisterClassic(classes = CLASSES) { for (const ext of EXTS) reg('delete', verbKey(classes, ext), '/f'); reg('delete', clsidKey(classes), '/f'); }
// every type: a 1.0.x install registered only .pdf
function classicRegistered(classes = CLASSES) { return EXTS.every(ext => reg('query', verbKey(classes, ext), '/v', 'ExplorerCommandHandler').status === 0); }

/* ---------- what was set up last time (so updates don't ask for admin again) ---------- */
const FIELDS = { Mode: 'mode', Location: 'location', Version: 'version', Declined: 'declined' };
function readState(key = STATE_KEY) {
  const out = {}, r = reg('query', key);
  if (r.status !== 0) return out;
  for (const line of r.stdout.split(/\r?\n/)) { const m = /^\s+(\w+)\s+REG_SZ\s*(.*)$/.exec(line); if (m && FIELDS[m[1]]) out[FIELDS[m[1]]] = m[2].trim(); }
  return out;
}
function writeState(o, key = STATE_KEY) {
  for (const [name, field] of Object.entries(FIELDS)) if (o[field] !== undefined) reg('add', key, '/v', name, '/d', String(o[field]), '/f');
}
function clearState(key = STATE_KEY) { reg('delete', key, '/f'); }

/* ---------- Windows 11 package ---------- */
function packageVersion() {
  const r = ps(`$p = Get-AppxPackage -Name ${psq(PKG)}; if ($p) { $p.Version.ToString() }`);
  return r.status === 0 ? (r.stdout || '').trim().split(/\r?\n/)[0] : '';
}
function removePackage() { ps(`Get-AppxPackage -Name ${psq(PKG)} | Remove-AppxPackage`); }   // no admin needed
// Does Windows still start the menu? An update deletes and re-makes the install folder; after that Windows
// refused the kept package ("access denied", menu gone) until it was added again (2026-10-16, 1.0.3 → 1.0.4).
function packageWorks(clsid = CLSID) {
  const r = ps(`try { $null = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]${psq(clsid)})); 'ok' } catch { 'failed' }`);
  return r.status === 0 && (r.stdout || '').trim() === 'ok';
}
// Start this exe again as admin (UAC names Sastra PDF) to add the package. 1223 = the user said No / no admin.
function elevate(exe) {
  const r = ps(`try { $p = Start-Process -FilePath ${psq(exe)} -ArgumentList '--explorer-menu=add-package' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 1223 }`);
  return r.status;
}
function addPackage({ installDir, msix }) {   // runs elevated
  const r = ps(`$ErrorActionPreference = 'Stop'; Get-AppxPackage -Name ${psq(PKG)} | Remove-AppxPackage; Add-AppxPackage -Path ${psq(msix)} -ExternalLocation ${psq(installDir)} -AllowUnsigned`);
  log(`add-package ${r.status === 0 ? 'ok' : 'failed'} ${(r.stderr || '').trim()}`);
  return r.status === 0 ? 0 : 1;
}

/* ---------- freeing the DLL so the installer can replace or remove it ---------- */
// A loaded DLL can't be deleted, but it can be moved on the same drive.
function oldDir(installDir) {
  const tmp = path.join(LIST_DIR(), 'old');
  return path.parse(tmp).root.toLowerCase() === path.parse(installDir).root.toLowerCase() ? tmp : path.join(path.dirname(installDir), 'sastra-pdf-old');
}
function cleanOld(installDir) {
  for (const d of new Set([path.join(LIST_DIR(), 'old'), path.join(path.dirname(installDir), 'sastra-pdf-old')])) {
    let files; try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) try { fs.unlinkSync(path.join(d, f)); } catch {}
    try { fs.rmdirSync(d); } catch {}
  }
}
function release({ installDir, dll }) {
  // Windows 11: the package's dllhost holds it — stop it (it starts again on the next right-click)
  ps(`Get-Process dllhost -ErrorAction SilentlyContinue | Where-Object { try { $_.Modules | Where-Object { $_.FileName -eq ${psq(dll)} } } catch { $null } } | Stop-Process -Force -ErrorAction SilentlyContinue`);
  if (!fs.existsSync(dll)) return;
  try { fs.unlinkSync(dll); return; } catch {}
  // classic menu: explorer.exe holds it — move it out of the install folder
  try { const d = oldDir(installDir); fs.mkdirSync(d, { recursive: true }); fs.renameSync(dll, path.join(d, `SastraMenu-${Date.now()}.dll`)); }
  catch (e) { log('release: could not move the DLL: ' + e.message); }
}

/* ---------- installer commands ---------- */
function install(o) {
  if (!fs.existsSync(o.dll)) { log('install: menu files missing'); return 3; }
  cleanOld(o.installDir);
  const st = readState();
  if (windowsBuild() >= 22000 && fs.existsSync(o.msix)) {
    if (st.mode === 'package' && st.location === o.installDir && st.version === PKG_VERSION && packageVersion() === PKG_VERSION) {
      if (packageWorks()) { unregisterClassic(); log('install: package already set up'); return 0; }
      log('install: package set up, but Windows no longer starts it; adding it again');   // one UAC prompt below
    }
    if (!o.silent && st.declined !== '1') {
      const code = elevate(o.exe);
      if (packageVersion() === PKG_VERSION) {   // checked as the user: an admin's password may have added it to the admin's account
        unregisterClassic(); writeState({ mode: 'package', location: o.installDir, version: PKG_VERSION, declined: '' });
        log(`install: package added${packageWorks() ? '' : ' (but Windows does not start it yet)'}`); return 0;
      }
      log(`install: package not added (elevate exit ${code}); using the classic menu`);
      st.declined = '1';
    }
  }
  removePackage();   // never both (a stale package + the classic keys would show the menu twice)
  if (!registerClassic(o.dll)) { log('install: classic registration failed'); return 1; }
  writeState({ mode: 'classic', location: o.installDir, version: PKG_VERSION, declined: st.declined || '' });
  log('install: classic menu'); return 0;
}
function uninstall(o) { removePackage(); unregisterClassic(); clearState(); release(o); log('uninstall: done'); return 0; }

function runCommand(cmd, o) {
  switch (cmd) {
    case 'install': return install(o);
    case 'uninstall': return uninstall(o);
    case 'release': release(o); return 0;
    case 'add-package': return addPackage(o);
    default: return 64;
  }
}

module.exports = {
  CLSID, PKG, PKG_VERSION, TASKS, EXTS, parseTaskArgs, readTaskList, registerClassic, unregisterClassic, classicRegistered,
  readState, writeState, clearState, windowsBuild, oldDir, cleanOld, release, runCommand, packageWorks
};

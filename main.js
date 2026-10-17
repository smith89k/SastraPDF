// Sastra PDF — Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const fsSync = require('fs');
const { execFile } = require('child_process');
const menu = require('./explorer-menu');
const updates = require('./updater');

const APP_NAME = 'Sastra PDF';
// Window title: "Sastra PDF v1.0.0", plus " (dev)" when run from source (pnpm start / run.bat).
const APP_TITLE = `${APP_NAME} v${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`;
let win = null;
let pendingPaths = [];      // PDFs passed before the window was ready
let allowClose = false;
let up = null;              // automatic updates (updater.js), only in the installed app

// Installer hooks (build/installer.nsh): "Sastra PDF.exe --explorer-menu=install|uninstall|release|add-package"
// sets up the File Explorer right-click menu and exits — before the single-instance lock, with no window.
const menuCmd = (process.argv.find(a => a.startsWith('--explorer-menu=')) || '').slice('--explorer-menu='.length);
if (menuCmd) {
  const res = path.join(process.resourcesPath, 'explorer-menu');
  process.exit(app.isPackaged ? menu.runCommand(menuCmd, {
    installDir: path.dirname(process.execPath), exe: process.execPath,
    dll: path.join(res, 'SastraMenu.dll'), msix: path.join(res, menu.PKG + '.msix'),
    silent: process.argv.includes('--silent')
  }) : 2);   // 2: only the installed app can register the menu
}

// Only one Sastra window; a second launch ("Open with") hands its files to the first.
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    if (handleTask(argv)) return;
    const files = pdfArgs(argv);
    if (files.length) remember('open', path.dirname(files[0]));   // opened from Explorer: the next Open starts there
    if (!win) { pendingPaths = files; createWindow(); return; }   // only the task window was open
    bringUp(win);
    if (files.length) win.webContents.send('open-paths', files);
  });
}

function pdfArgs(argv) {
  return argv.slice(1).filter(a => /\.pdf$/i.test(a) && !a.startsWith('--')).map(a => path.resolve(a));
}

// Windows won't let a program in the background take the front (its taskbar button only flashes) — e.g. when
// Sastra was already running behind another program, or you clicked elsewhere while it started. A moment
// "always on top" still puts the window above the other programs.
function bringUp(w) {
  if (w.isMinimized()) w.restore();
  w.setAlwaysOnTop(true); w.show(); w.focus(); w.setAlwaysOnTop(false);
}

// The logo row is the title bar: Windows' own bar is 8 px shorter when maximized (its edge goes off-screen), so
// the app would jump. Windows still draws minimize / maximize / close over the row's right end, in the
// page's colours (--chrome / --fg in app/index.html); the File / Edit / View / Help menu opens from ☰.
const BAR_H = 44;   // the logo row without its 1 px bottom line (app/index.html .menubar)
const BAR_COLORS = { light: { color: '#efece8', symbolColor: '#23201c' }, dark: { color: '#1f1d1b', symbolColor: '#ece8e2' } };
const barColors = () => BAR_COLORS[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];
function paintBar() { if (win) win.setTitleBarOverlay(barColors()); }

function createWindow() {
  allowClose = false;   // a window opened again later must ask again
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 720, minHeight: 480,
    title: APP_TITLE,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#efece8',
    titleBarStyle: 'hidden', titleBarOverlay: { ...barColors(), height: BAR_H },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      additionalArguments: ['--sastra-title=' + APP_TITLE]   // read by preload.js
    }
  });
  win.once('ready-to-show', () => { win.maximize(); bringUp(win); });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Links in documents open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  // full screen has no caption buttons: the page stops keeping room for them
  win.on('enter-full-screen', () => win.webContents.send('full-screen', true));
  win.on('leave-full-screen', () => win.webContents.send('full-screen', false));

  // Ask the page about unsaved changes before closing.
  win.on('close', e => {
    if (allowClose) return;
    e.preventDefault();
    // the page asks in its own dialog (unsaved changes), so it must be visible — e.g. closed from the taskbar
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('close-request');
  });
  win.on('closed', () => { win = null; });
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

/* ---------- File Explorer menu jobs (SastraMenu.dll → --sastra-task / --sastra-list) ---------- */
let taskWin = null, taskReady = false, taskQueue = [];
const TASK_W = 440;
// true when argv is a menu job (handled, or empty because its files are gone)
function handleTask(argv) {
  const t = menu.parseTaskArgs(argv); if (!t) return false;
  const paths = menu.readTaskList(t.list);
  if (!paths.length) return true;
  if (t.task === 'combine') { if (!win) createWindow(); sendToMain('combine-paths', paths); }
  else { taskQueue.push({ task: t.task, paths }); openTaskWindow(); flushTasks(); }
  return true;
}
function sendToMain(channel, data) {
  const wc = win.webContents;
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send(channel, data)); else wc.send(channel, data);
  if (win.isVisible()) bringUp(win);
}
function openTaskWindow() {
  if (taskWin) { bringUp(taskWin); return; }
  taskReady = false;
  taskWin = new BrowserWindow({
    // no Windows title bar: it looks like the app's own boxes (drag it anywhere; Cancel/Close/Esc close it)
    frame: false, width: TASK_W, height: 140, useContentSize: true, resizable: false, maximizable: false, fullscreenable: false,
    title: APP_NAME, icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#efece8', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      additionalArguments: ['--sastra-title=' + APP_TITLE] }
  });
  taskWin.setMenu(null);
  taskWin.once('ready-to-show', () => bringUp(taskWin));
  taskWin.loadFile(path.join(__dirname, 'app', 'task.html'));
  taskWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  taskWin.webContents.on('will-navigate', e => e.preventDefault());
  taskWin.on('closed', () => { taskWin = null; taskReady = false; taskQueue = []; });
}
function flushTasks() { if (taskWin && taskReady) for (const b of taskQueue.splice(0)) taskWin.webContents.send('task-batch', b); }
ipcMain.on('task-ready', e => { if (taskWin && e.sender === taskWin.webContents) { taskReady = true; flushTasks(); } });
// a question in the task window ("already there"): bring it up so it's seen
ipcMain.on('task-focus', e => { if (taskWin && e.sender === taskWin.webContents) bringUp(taskWin); });
// The task window is as tall as its contents (task.js measures them): small while working, taller with problems.
ipcMain.on('task-size', (e, h) => {
  if (taskWin && e.sender === taskWin.webContents && Number.isFinite(h)) taskWin.setContentSize(TASK_W, Math.max(100, Math.min(420, Math.ceil(h))));
});

function buildMenu() {
  // registerAccelerator:false = shortcut is shown in the menu, but the page handles the key itself.
  const k = (label, accelerator, cmd) => ({ label, accelerator, registerAccelerator: false, click: () => send(cmd) });
  const template = [
    { label: '&File', submenu: [
      k('&Open…', 'Ctrl+O', 'open'),
      { type: 'separator' },
      k('&Save', 'Ctrl+S', 'save'),
      k('Save &As…', 'Ctrl+Shift+S', 'saveAs'),
      { type: 'separator' },
      k('&Print…', 'Ctrl+P', 'print'),
      { type: 'separator' },
      k('&Close Tab', 'Ctrl+W', 'closeTab'),
      k('Next Ta&b', 'Ctrl+Tab', 'nextTab'),
      k('Pre&vious Tab', 'Ctrl+Shift+Tab', 'prevTab'),
      { label: 'E&xit', accelerator: 'Alt+F4', click: () => win && win.close() }
    ]},
    { label: '&Edit', submenu: [
      k('&Undo', 'Ctrl+Z', 'undo'),
      k('&Redo', 'Ctrl+Y', 'redo'),
      { type: 'separator' },
      k('Select &All Pages', 'Ctrl+A', 'selectAll'),
      k('&Delete Pages', 'Delete', 'delete'),
      { type: 'separator' },
      k('Rotate &Left', 'Ctrl+Shift+L', 'rotL'),
      k('Rotate &Right', 'Ctrl+Shift+R', 'rotR')
    ]},
    { label: '&View', submenu: [
      k('Zoom &In', 'Ctrl+=', 'zoomIn'),
      k('Zoom &Out', 'Ctrl+-', 'zoomOut'),
      k('&Actual Size', 'Ctrl+1', 'actual'),
      k('Fit &Page', 'Ctrl+0', 'fitPage'),
      k('Fit &Width', 'Ctrl+2', 'fitWidth'),
      { type: 'separator' },
      k('&Hand Tool', 'H', 'hand'),
      k('&Select Tool', 'V', 'select'),
      { type: 'separator' },
      k('&Maximize Page Area', 'F', 'focus'),
      k('P&resent from This Page', 'Shift+F5', 'present'),
      k('Present from the &Beginning', 'F5', 'presentStart'),
      { label: '&Theme', submenu: [
        { id: 'theme-system', label: '&System', type: 'radio', click: () => send('themeSystem') },
        { id: 'theme-light', label: '&Light', type: 'radio', click: () => send('themeLight') },
        { id: 'theme-dark', label: '&Dark', type: 'radio', click: () => send('themeDark') }
      ]},
      { label: '&Full Screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'Ctrl+Shift+I', click: () => win && win.webContents.toggleDevTools() }
    ]},
    { label: '&Help', submenu: [
      { label: 'Check for &Updates…', click: () => send('checkUpdates') },   // answers in the page's own boxes
      { label: "What's &New", click: () => send('whatsNew') },   // the page's What's new window (notes.js)
      { label: '&About Sastra PDF', click: () => send('about') }   // the page shows its own About screen
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- IPC ---------- */
const PDF_FILTER = [{ name: 'PDF documents', extensions: ['pdf'] }];

async function readPdf(p) {
  const buf = await fs.readFile(p);
  return { path: p, name: path.basename(p), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

// The folders Open and Save used last, kept across restarts: since Electron 43 a dialog without defaultPath always starts
// in Downloads. <userData>\folders.json = { open, save }. A file opened from Explorer counts for Open; a folder that is
// gone (or nothing yet) → Documents.
const folders = { open: null, save: null };
let foldersRead = null;
const readFolders = () => foldersRead ??= fs.readFile(path.join(app.getPath('userData'), 'folders.json'), 'utf8').then(t => {
  const o = JSON.parse(t); for (const k of ['open', 'save']) if (typeof o[k] === 'string' && path.isAbsolute(o[k])) folders[k] = o[k];
}, () => {}).catch(() => {});
async function remember(kind, dir){
  await readFolders();
  if (!dir || folders[kind] === dir) return;
  folders[kind] = dir;
  await fs.writeFile(path.join(app.getPath('userData'), 'folders.json'), JSON.stringify(folders)).catch(() => {});
}
async function startIn(kind){ await readFolders(); const d = folders[kind]; return d && await isDir(d) ? d : app.getPath('documents'); }

ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open PDF', defaultPath: await startIn('open'), properties: ['openFile', 'multiSelections'], filters: PDF_FILTER });
  if (r.canceled) return [];
  if (r.filePaths.length) remember('open', path.dirname(r.filePaths[0]));
  // only the names: the page reads each file itself (read-file), so its progress box can say which one
  return r.filePaths.map(p => ({ path: p, name: path.basename(p) }));
});

ipcMain.handle('read-file', async (_e, p) => {
  try { return await readPdf(p); } catch (e) { return { path: p, name: path.basename(p), error: e.message }; }
});

ipcMain.handle('write-file', async (_e, { filePath, data }) => {
  await fs.writeFile(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('save-dialog', async (_e, { defaultName, data, kind, dir }) => {
  const ext = (path.extname(defaultName).slice(1) || 'pdf').toLowerCase();
  const names = { pdf: 'PDF document', png: 'PNG image', jpg: 'JPEG image' };
  // dir: where the doc came from (Combine from the Explorer menu), else the last folder used
  const start = typeof dir === 'string' && path.isAbsolute(dir) && await isDir(dir) ? dir : await startIn('save');
  const r = await dialog.showSaveDialog(win, {
    title: kind === 'export' ? 'Export' : kind === 'pdf' ? 'Save as PDF' : 'Save As',
    defaultPath: path.join(start, defaultName),
    filters: [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  remember('save', path.dirname(r.filePath));
  await fs.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});

// Saving several files (Split / Export "Save to folder", Explorer-menu jobs): the page picks the folder(s),
// asks `name-clashes`, shows the Replace / Keep both / Cancel question in its OWN box (never a Windows box,
// so it looks like the rest of the app), then gets the final names from `resolve-names`.
const exists = p => fs.access(p).then(() => true, () => false);
const numbered = (name, k) => { const ext = path.extname(name); return `${name.slice(0, name.length - ext.length)} (${k})${ext}`; };
// groups = [{ dir, names }] → file names only (never a path); the same name twice in one group gets " (2)", like Explorer
function nameGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(g => {
    const seen = new Set(), names = (Array.isArray(g.names) ? g.names : []).map(n => {
      const base = path.basename(String(n)); let name = base, k = 1;
      while (seen.has(name.toLowerCase())) name = numbered(base, ++k);
      seen.add(name.toLowerCase()); return name;
    });
    return { dir: String(g.dir), names, seen };
  });
}
async function clashesOf(gs) {
  const clash = [];
  for (const g of gs) for (const n of g.names) if (await exists(path.join(g.dir, n))) clash.push({ g, n });
  return clash;
}
// → { count: 0 } or { count, message, detail } for the page's question
ipcMain.handle('name-clashes', async (_e, groups) => {
  const gs = nameGroups(groups), clash = await clashesOf(gs);
  if (!clash.length) return { count: 0 };
  return {
    count: clash.length,
    message: clash.length === 1 ? `"${clash[0].n}" is already in ${gs.length > 1 ? 'its folder' : 'this folder'}.` : `${clash.length} of these files are already in ${gs.length > 1 ? 'their folders' : 'this folder'}.`,
    detail: 'Replace them, or keep both? With Keep both the new files get a number added to their name.'
  };
});
// choice 'keep': a clashing name gets the first free " (n)"; otherwise (replace / no clash) names stay → final names per group
ipcMain.handle('resolve-names', async (_e, groups, choice) => {
  const gs = nameGroups(groups);
  const clash = choice === 'keep' ? await clashesOf(gs) : [];
  const out = [];
  for (const g of gs) {
    const list = [];
    for (const n of g.names) {
      let name = n;
      if (clash.some(c => c.g === g && c.n === n)) {
        let k = 1;
        do name = numbered(n, ++k); while (g.seen.has(name.toLowerCase()) || await exists(path.join(g.dir, name)));
        g.seen.add(name.toLowerCase());
      }
      list.push(name);
    }
    out.push(list);
  }
  return out;
});
// Split / Export with several files: pick the folder first, before anything is made → { dir } or null
ipcMain.handle('pick-folder', async (_e, { title } = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: String(title || 'Choose a folder'), buttonLabel: 'Save here',
    defaultPath: await startIn('save'), properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  remember('save', r.filePaths[0]);
  return { dir: r.filePaths[0] };
});
const isDir = p => fs.stat(p).then(s => s.isDirectory(), () => false);
// Explorer-menu "… to folder": only "<existing folder>\<one name>" is ever made.
ipcMain.handle('make-dir', async (_e, dir) => {
  const d = path.resolve(String(dir));
  if (!(await isDir(path.dirname(d)))) return { error: 'its folder is gone' };
  try { await fs.mkdir(d); } catch (e) { if (e.code !== 'EEXIST') return { error: e.code === 'EPERM' || e.code === 'EACCES' ? 'no permission' : e.message }; }
  return (await isDir(d)) ? { dir: d } : { error: 'a file already has that name' };
});

ipcMain.on('close-now', () => { allowClose = true; if (win) win.close(); });
ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(t); });
// The page owns the theme choice; the title bar and the View > Theme radio follow it.
ipcMain.on('set-theme', (_e, t) => {
  if (!['system', 'light', 'dark'].includes(t)) return;
  nativeTheme.themeSource = t;
  const item = Menu.getApplicationMenu()?.getMenuItemById('theme-' + t);
  if (item) item.checked = true;
  paintBar();
});
// ☰ in the logo row (or Alt / F10): the app menu drops down under it — x, y in the page's pixels
ipcMain.on('show-menu', (e, x, y) => {
  if (!win || e.sender !== win.webContents) return;
  Menu.getApplicationMenu()?.popup({ window: win, x: Math.max(0, Math.round(+x) || 0), y: Math.max(0, Math.round(+y) || 0) });
});
ipcMain.on('show-folder', (_e, p) => { if (p) shell.showItemInFolder(p); });

/* Printing: the page draws every sheet itself (app/print.js) and fills #printArea; this sends it,
   with no system dialog, to the printer chosen in the page's Print window. */
const PAPERS = ['A3', 'A4', 'A5', 'Letter', 'Legal'];
const DUPLEX = ['simplex', 'shortEdge', 'longEdge'];
// Electron's printer list no longer says which one is the default; Windows keeps it as
// "Name,winspool,Ne01:" (printer names can't contain a comma).
const defaultPrinter = () => new Promise(res => execFile('reg.exe',
  ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'], { windowsHide: true },
  (err, out) => { const m = !err && /Device\s+REG_SZ\s+([^,\r\n]+)/.exec(out); res(m ? m[1].trim() : ''); }));
async function printerList() {
  if (!win) return [];
  const [list, def] = await Promise.all([win.webContents.getPrintersAsync(), defaultPrinter()]);
  return list.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: p.name === def }));
}
ipcMain.handle('printers', () => printerList());
ipcMain.handle('print', (_e, o = {}) => new Promise(res => {
  if (!win) return res({ ok: false, reason: 'no window' });
  win.webContents.print({
    silent: true, printBackground: true, landscape: false, collate: true,
    deviceName: String(o.deviceName || ''),
    copies: Math.max(1, Math.min(999, Math.floor(+o.copies) || 1)),
    color: o.color !== false,
    duplexMode: DUPLEX.includes(o.duplexMode) ? o.duplexMode : 'simplex',
    pageSize: PAPERS.includes(o.pageSize) ? o.pageSize : 'A4',
    margins: { marginType: 'none' }   // each sheet image is exactly one sheet of paper
  }, (ok, reason) => res({ ok, reason: ok ? '' : String(reason || '') }));
}));
// "Properties": Windows' own Printing preferences for that printer (tray, quality…). Unlike Acrobat's
// per-job Properties, what is changed there stays as the printer's default for this user.
ipcMain.handle('printer-prefs', async (_e, name) => {
  if (!(await printerList()).some(p => p.name === name)) return false;
  execFile('rundll32.exe', ['printui.dll,PrintUIEntry', '/e', '/n', name], () => {});
  return true;
});
ipcMain.handle('app-version', () => app.getVersion());

/* Automatic updates (updater.js). The page asks about unsaved changes BEFORE install-update: quitAndInstall starts the
   installer at once and it closes the app by force, so nothing may be left to ask by then. */
ipcMain.handle('check-updates', () => up ? up.checkNow() : { kind: 'dev' });
ipcMain.handle('install-update', () => {
  const block = updates.installBlock({ downloaded: up && up.downloaded(), taskOpen: !!taskWin });
  if (block) return { ok: false, reason: block };
  allowClose = true;   // before: the app quits a moment after the installer starts
  if (up.install()) return { ok: true };
  allowClose = false;  // it didn't start: closing must ask about unsaved changes again
  return { ok: false, reason: 'failed' };
});
// After a silent update the right-click menu may have fallen back to "Show more options" (explorer-menu.js
// repairNeeded): 'check' → { needed }, 'later' → not again for this version, 'fix' → the installer's own setup step,
// run as a separate process so the window doesn't freeze while Windows asks for permission.
ipcMain.handle('menu-repair', async (_e, action) => {
  if (action === 'check') {
    return { needed: app.isPackaged && menu.repairNeeded({
      build: menu.windowsBuild(), msixExists: fsSync.existsSync(path.join(process.resourcesPath, 'explorer-menu', menu.PKG + '.msix')),
      state: menu.readState(), version: app.getVersion()
    }) };
  }
  if (action === 'later') { menu.writeState({ asked: app.getVersion() }); return {}; }
  if (action === 'fix') {
    await new Promise(res => execFile(process.execPath, ['--explorer-menu=install'], { windowsHide: true }, () => res()));
    const st = menu.readState();
    return { result: st.mode === 'package' ? 'ok' : st.declined === '1' ? 'declined' : 'failed' };
  }
  return {};
});
ipcMain.handle('initial-paths', () => { const p = pendingPaths; pendingPaths = []; return p; });

app.whenReady().then(() => {
  app.setAppUserModelId('kh.sastra.pdf');
  // Once, before any window: on Windows setApplicationMenu puts the menu on EVERY open window, so setting it
  // when the main window opens would give the Explorer-menu task window a File/Edit/View bar too.
  buildMenu();
  nativeTheme.on('updated', paintBar);   // theme "System" and Windows switched light ↔ dark
  if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath));
  if (handleTask(process.argv)) { if (!win && !taskWin) app.quit(); return; }
  pendingPaths = pdfArgs(process.argv);
  if (pendingPaths.length) remember('open', path.dirname(pendingPaths[0]));
  createWindow();
  // a right-click job alone (above) never checks; electron-updater is loaded only here
  if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform, portable: !!process.env.PORTABLE_EXECUTABLE_DIR })) {
    up = updates.createUpdater({
      updater: require('electron-updater').autoUpdater, current: app.getVersion(),
      send: (channel, v) => { if (win) win.webContents.send(channel, v); },
      log: updates.logTo(path.join(os.tmpdir(), 'Sastra PDF', 'update.log'))
    });
  }
});
app.on('window-all-closed', () => app.quit());

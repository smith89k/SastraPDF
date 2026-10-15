// Sastra PDF — Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const menu = require('./explorer-menu');

const APP_NAME = 'Sastra PDF';
// Window title: "Sastra PDF v1.0.0", plus " (dev)" when run from source (npm start / run.bat).
const APP_TITLE = `${APP_NAME} v${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`;
let win = null;
let pendingPaths = [];      // PDFs passed before the window was ready
let allowClose = false;

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
    if (!win) { pendingPaths = files; createWindow(); return; }   // only the task window was open
    if (win.isMinimized()) win.restore();
    win.focus();
    if (files.length) win.webContents.send('open-paths', files);
  });
}

function pdfArgs(argv) {
  return argv.slice(1).filter(a => /\.pdf$/i.test(a) && !a.startsWith('--')).map(a => path.resolve(a));
}

function createWindow() {
  allowClose = false;   // a window opened again later must ask again
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 720, minHeight: 480,
    title: APP_TITLE,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#efece8',
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
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Links in documents open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());

  // Ask the page about unsaved changes before closing.
  win.on('close', e => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('close-request');
  });
  win.on('closed', () => { win = null; });
  buildMenu();
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

/* ---------- File Explorer menu jobs (SastraMenu.dll → --sastra-task / --sastra-list) ---------- */
let taskWin = null, taskReady = false, taskQueue = [];
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
  if (win.isVisible()) { if (win.isMinimized()) win.restore(); win.focus(); }
}
function openTaskWindow() {
  if (taskWin) { if (taskWin.isMinimized()) taskWin.restore(); taskWin.focus(); return; }
  taskReady = false;
  taskWin = new BrowserWindow({
    width: 480, height: 280, useContentSize: true, resizable: false, maximizable: false, fullscreenable: false,
    title: APP_NAME, icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#efece8', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
      additionalArguments: ['--sastra-title=' + APP_TITLE] }
  });
  taskWin.setMenu(null);
  taskWin.once('ready-to-show', () => taskWin.show());
  taskWin.loadFile(path.join(__dirname, 'app', 'task.html'));
  taskWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  taskWin.webContents.on('will-navigate', e => e.preventDefault());
  taskWin.on('closed', () => { taskWin = null; taskReady = false; taskQueue = []; });
}
function flushTasks() { if (taskWin && taskReady) for (const b of taskQueue.splice(0)) taskWin.webContents.send('task-batch', b); }
ipcMain.on('task-ready', e => { if (taskWin && e.sender === taskWin.webContents) { taskReady = true; flushTasks(); } });

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

// Since Electron 43 a dialog without defaultPath always starts in Downloads, so remember the folder here.
let lastOpenDir = null;
ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open PDF', defaultPath: lastOpenDir || undefined, properties: ['openFile', 'multiSelections'], filters: PDF_FILTER });
  if (r.canceled) return [];
  if (r.filePaths.length) lastOpenDir = path.dirname(r.filePaths[0]);
  const out = [];
  for (const p of r.filePaths) { try { out.push(await readPdf(p)); } catch (e) { out.push({ path: p, name: path.basename(p), error: e.message }); } }
  return out;
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
  const start = typeof dir === 'string' && path.isAbsolute(dir) && await isDir(dir) ? dir : (lastDir || app.getPath('documents'));
  const r = await dialog.showSaveDialog(win, {
    title: kind === 'export' ? 'Export' : 'Save As',
    defaultPath: path.join(start, defaultName),
    filters: [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  lastDir = path.dirname(r.filePath);
  await fs.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});
let lastDir = null;

// Split / Export with several files: pick a folder (before anything is made), then check the names.
// Returns the folder and the final names, or null when cancelled. The page writes each file itself.
const exists = p => fs.access(p).then(() => true, () => false);
const numbered = (name, k) => { const ext = path.extname(name); return `${name.slice(0, name.length - ext.length)} (${k})${ext}`; };
// Names already in the folder(s): ONE question for the whole batch. groups = [{ dir, names }] → final names per
// group (same order), or null when cancelled. File names only (never a path); the same name twice in one group
// gets " (2)", like Explorer.
async function resolveNames(groups, parent) {
  const gs = (Array.isArray(groups) ? groups : []).map(g => {
    const seen = new Set(), names = (Array.isArray(g.names) ? g.names : []).map(n => {
      const base = path.basename(String(n)); let name = base, k = 1;
      while (seen.has(name.toLowerCase())) name = numbered(base, ++k);
      seen.add(name.toLowerCase()); return name;
    });
    return { dir: String(g.dir), names, seen };
  });
  const clash = [];
  for (const g of gs) for (const n of g.names) if (await exists(path.join(g.dir, n))) clash.push({ g, n });
  if (!clash.length) return gs.map(g => g.names);
  const where = gs.length > 1 ? 'their folders' : 'this folder';
  const q = await dialog.showMessageBox(parent, {
    type: 'question', buttons: ['Replace', 'Keep both', 'Cancel'], defaultId: 1, cancelId: 2, noLink: true, title: APP_NAME,
    message: clash.length === 1 ? `"${clash[0].n}" is already in ${gs.length > 1 ? 'its folder' : 'this folder'}.` : `${clash.length} of these files are already in ${where}.`,
    detail: 'Replace them, or keep both? With Keep both the new files get a number added to their name.'
  });
  if (q.response === 2) return null;
  if (q.response === 0) return gs.map(g => g.names);
  const out = [];   // Keep both: a clashing name gets the first free number
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
}
ipcMain.handle('pick-folder', async (_e, { title, names } = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: String(title || 'Choose a folder'), buttonLabel: 'Save here',
    defaultPath: lastDir || app.getPath('documents'), properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  const dir = r.filePaths[0]; lastDir = dir;
  const final = await resolveNames([{ dir, names }], win);
  return final ? { dir, names: final[0] } : null;
});
ipcMain.handle('resolve-names', (e, groups) => resolveNames(groups, BrowserWindow.fromWebContents(e.sender)));
const isDir = p => fs.stat(p).then(s => s.isDirectory(), () => false);
// Explorer-menu "… to folder": only "<existing folder>\<one name>" is ever made.
ipcMain.handle('make-dir', async (_e, dir) => {
  const d = path.resolve(String(dir));
  if (!(await isDir(path.dirname(d)))) return { error: 'its folder is gone' };
  try { await fs.mkdir(d); } catch (e) { if (e.code !== 'EEXIST') return { error: e.code === 'EPERM' || e.code === 'EACCES' ? 'no permission' : e.message }; }
  return (await isDir(d)) ? { dir: d } : { error: 'a file already has that name' };
});

ipcMain.handle('confirm-close', async (_e, names) => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Close without saving', 'Cancel'], defaultId: 1, cancelId: 1,
    title: APP_NAME, message: 'Some files have unsaved changes.',
    detail: names.join('\n')
  });
  return r.response === 0;
});

ipcMain.on('close-now', () => { allowClose = true; if (win) win.close(); });
ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(t); });
// The page owns the theme choice; the title bar and the View > Theme radio follow it.
ipcMain.on('set-theme', (_e, t) => {
  if (!['system', 'light', 'dark'].includes(t)) return;
  nativeTheme.themeSource = t;
  const item = Menu.getApplicationMenu()?.getMenuItemById('theme-' + t);
  if (item) item.checked = true;
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
ipcMain.handle('initial-paths', () => { const p = pendingPaths; pendingPaths = []; return p; });

app.whenReady().then(() => {
  app.setAppUserModelId('kh.sastra.pdf');
  if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath));
  if (handleTask(process.argv)) { if (!win && !taskWin) app.quit(); return; }
  pendingPaths = pdfArgs(process.argv);
  createWindow();
});
app.on('window-all-closed', () => app.quit());

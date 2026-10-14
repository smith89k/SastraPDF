// Sastra PDF — Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const APP_NAME = 'Sastra PDF';
let win = null;
let pendingPaths = [];      // PDFs passed before the window was ready
let allowClose = false;

// Only one Sastra window; a second launch ("Open with") hands its files to the first.
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    const files = pdfArgs(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (files.length) win.webContents.send('open-paths', files);
    }
  });
}

function pdfArgs(argv) {
  return argv.slice(1).filter(a => /\.pdf$/i.test(a) && !a.startsWith('--')).map(a => path.resolve(a));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 720, minHeight: 480,
    title: APP_NAME,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#efece8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
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

ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open PDF', properties: ['openFile', 'multiSelections'], filters: PDF_FILTER });
  if (r.canceled) return [];
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

ipcMain.handle('save-dialog', async (_e, { defaultName, data, kind }) => {
  const ext = (path.extname(defaultName).slice(1) || 'pdf').toLowerCase();
  const names = { pdf: 'PDF document', zip: 'ZIP archive', png: 'PNG image', jpg: 'JPEG image' };
  const last = app.getPath('documents');
  const r = await dialog.showSaveDialog(win, {
    title: kind === 'export' ? 'Export' : 'Save As',
    defaultPath: path.join(lastDir || last, defaultName),
    filters: [{ name: names[ext] || ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  lastDir = path.dirname(r.filePath);
  await fs.writeFile(r.filePath, Buffer.from(data));
  return r.filePath;
});
let lastDir = null;

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
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('initial-paths', () => { const p = pendingPaths; pendingPaths = []; return p; });

app.whenReady().then(() => {
  app.setAppUserModelId('kh.sastra.pdf');
  pendingPaths = pdfArgs(process.argv);
  createWindow();
});
app.on('window-all-closed', () => app.quit());

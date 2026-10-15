// Sastra PDF — safe bridge between the page and the main process
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('sastra', {
  isDesktop: true,
  // window title tag from main.js: "Sastra PDF v1.0.0", or "Sastra PDF v1.0.0 (dev)" when run from source
  appTitle: (process.argv.find(a => a.startsWith('--sastra-title=')) || '--sastra-title=Sastra PDF').slice('--sastra-title='.length),
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  readFile: p => ipcRenderer.invoke('read-file', p),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', { filePath, data }),
  saveDialog: (defaultName, data, kind) => ipcRenderer.invoke('save-dialog', { defaultName, data, kind }),
  pickFolder: (title, names) => ipcRenderer.invoke('pick-folder', { title, names }),
  confirmClose: names => ipcRenderer.invoke('confirm-close', names),
  closeNow: () => ipcRenderer.send('close-now'),
  setTitle: t => ipcRenderer.send('set-title', t),
  setTheme: t => ipcRenderer.send('set-theme', t),
  showInFolder: p => ipcRenderer.send('show-folder', p),
  initialPaths: () => ipcRenderer.invoke('initial-paths'),
  appVersion: () => ipcRenderer.invoke('app-version'),
  printers: () => ipcRenderer.invoke('printers'),
  print: opts => ipcRenderer.invoke('print', opts),
  printerPrefs: name => ipcRenderer.invoke('printer-prefs', name),
  pathForFile: f => { try { return webUtils.getPathForFile(f) || null; } catch { return null; } },
  onMenu: fn => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
  onOpenPaths: fn => ipcRenderer.on('open-paths', (_e, paths) => fn(paths)),
  onCloseRequest: fn => ipcRenderer.on('close-request', () => fn())
});

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alertAPI', {
  onLockdown: (cb) => ipcRenderer.on('lockdown-data', (_e, x) => cb(x)),
  onAllClear: (cb) => ipcRenderer.on('all-clear', cb),
  onAcknowledged: (cb) => ipcRenderer.on('acknowledged', cb),
  acknowledge: () => ipcRenderer.send('acknowledge-alert')
});
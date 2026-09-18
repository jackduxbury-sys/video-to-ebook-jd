const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sbky', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setRoom: (name) => ipcRenderer.invoke('set-room', name),
  verifyPin: (pin) => ipcRenderer.invoke('verify-pin', pin),
  sendLockdown: (pin) => ipcRenderer.invoke('send-lockdown', pin),
  sendClear: (pin) => ipcRenderer.invoke('send-clear', pin),
  sendTest: (pin) => ipcRenderer.invoke('send-test', pin),
  localTestAlert: () => ipcRenderer.invoke('local-test-alert'),
  localClearAlert: () => ipcRenderer.invoke('local-clear-alert'),
  onStatus: (cb) => ipcRenderer.on('connection-status', (_e, x) => cb(x)),
  onRemoteTest: (cb) => ipcRenderer.on('remote-test', (_e, x) => cb(x))
});
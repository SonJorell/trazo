// Puente mínimo y seguro entre la página de Trazo y la ventana de Electron.
// Solo expone acciones concretas; la página no accede a Node ni a Electron.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trazoOverlay', {
  ready: () => ipcRenderer.send('overlay:ready'),
  setMode: (mode) => ipcRenderer.send('overlay:set-mode', mode === 'draw' ? 'draw' : 'pass'),
  setInteractive: (on) => ipcRenderer.send('overlay:set-interactive', Boolean(on)),
  setSharing: (on) => ipcRenderer.send('overlay:sharing', Boolean(on)),
  hide: () => ipcRenderer.send('overlay:hide'),
  pressKey: (action, style) => ipcRenderer.invoke('overlay:key', action, style),
  quit: () => ipcRenderer.send('overlay:quit'),
  onMode: (cb) => ipcRenderer.on('overlay:mode', (_e, mode) => cb(mode)),
  onCommand: (cb) => ipcRenderer.on('overlay:command', (_e, cmd) => cb(cmd)),
});

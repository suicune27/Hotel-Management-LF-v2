const { contextBridge } = require('electron');

// Expose a minimal API to the renderer process securely
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});

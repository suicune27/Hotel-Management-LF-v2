const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});

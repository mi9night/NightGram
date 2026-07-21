const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nightgramDesktop', {
  platform: process.platform,
  isDesktop: true,
  electronVersion: process.versions.electron,
  appVersion: () => ipcRenderer.invoke('desktop:get-version'),
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  updateSettings: (patch) => ipcRenderer.invoke('desktop:update-settings', patch),
  showNotification: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  reportError: (payload) => ipcRenderer.invoke('desktop:report-error', payload),
  getDiagnostics: () => ipcRenderer.invoke('desktop:get-diagnostics'),
  openDiagnostics: () => ipcRenderer.invoke('desktop:open-diagnostics'),
  exportDiagnostics: () => ipcRenderer.invoke('desktop:export-diagnostics'),
  exportPreferences: (webPreferences) => ipcRenderer.invoke('desktop:export-preferences', webPreferences),
  importPreferences: () => ipcRenderer.invoke('desktop:import-preferences'),
  getUpdateState: () => ipcRenderer.invoke('desktop:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('desktop:download-update'),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update'),
  openUpdateFolder: () => ipcRenderer.invoke('desktop:open-update-folder'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:update-state', listener);
    return () => ipcRenderer.removeListener('desktop:update-state', listener);
  },
  openDownloads: () => ipcRenderer.invoke('desktop:open-downloads'),
  chooseDisplaySource: () => ipcRenderer.invoke('desktop:choose-display-source'),
  clearCache: () => ipcRenderer.invoke('desktop:clear-cache'),
  restart: () => ipcRenderer.invoke('desktop:restart'),
  quit: () => ipcRenderer.invoke('desktop:quit'),
});

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('vconnect', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
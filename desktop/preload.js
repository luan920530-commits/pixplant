/* Puente seguro (contextIsolation) entre el menú nativo y la interfaz.
   Solo expone una suscripción: imagen abierta desde Archivo → Abrir imagen… */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('texplantNative', {
  platform: process.platform,
  arch: process.arch,
  onOpenImage(callback) {
    ipcRenderer.on('native:open-image', (_event, dataUrl) => callback(dataUrl));
  },
});

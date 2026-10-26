/* TexPlant Studio — proceso principal Electron (app nativa de escritorio).
   La misma interfaz web se ejecuta localmente, sin servidor ni internet.
   Compilación: macOS Intel (x64) · Windows (x64) · Linux (x64). */
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isMac = process.platform === 'darwin';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 960, minHeight: 640,
    backgroundColor: '#101410',
    title: 'TexPlant Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  const openImage = async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Abrir imagen',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    });
    if (canceled || !filePaths[0]) return;
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase().replace('jpg', 'jpeg');
    const data = fs.readFileSync(filePaths[0]).toString('base64');
    win.webContents.send('native:open-image', `data:image/${ext};base64,${data}`);
  };

  const menu = Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir imagen…', accelerator: 'CmdOrCtrl+O', click: openImage },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Salir' },
      ],
    },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [{
        label: 'Acerca de TexPlant Studio',
        click: () => dialog.showMessageBox(win, {
          type: 'info', title: 'TexPlant Studio',
          message: 'TexPlant Studio',
          detail: 'Generador de texturas PBR seamless para Blender.\nFoto → BaseColor · Normal · Height · Bump · Displacement · Roughness · Metallic · AO\n\nGPL-3.0 — Todo el procesamiento es local.',
        }),
      }],
    },
  ]);
  Menu.setApplicationMenu(menu);
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (!isMac) app.quit(); });

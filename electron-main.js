import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiServer } from './api-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let apiServerInstance = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "MINDMATRIX AI PROCTOR X",
    autoHideMenuBar: true,
  });

  // In production, load the built index.html
  // In development, load the Vite dev server URL
  if (app.isPackaged) {
    // Start the API server on port 3000
    if (!apiServerInstance) {
      const userDataPath = app.getPath('userData');
      const apiApp = createApiServer(userDataPath);
      apiServerInstance = apiApp.listen(3000, '127.0.0.1', () => {
        console.log('Local API server running on port 3000 at', userDataPath);
      });
    }
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    win.loadURL('http://localhost:3000');
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (apiServerInstance) {
    apiServerInstance.close();
  }
});

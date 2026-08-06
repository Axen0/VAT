const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const storeSchema = require('./electron-store-schema');
const { registerIpcHandlers } = require('./ipc-handlers');
const roomState = require('./room-state');
const fileManager = require('./file-manager');

const store = new Store({ schema: storeSchema });

let mainWindow;

async function createWindow() {
  try {
    await fileManager.ensureDir(fileManager.userDataPath);
    await fileManager.ensureDir(fileManager.roomsPath);
  } catch (error) {
    console.error('Failed to create VAT directories:', error);
  }

  const windowBounds = store.get('windowBounds', { width: 800, height: 600 });

  mainWindow = new BrowserWindow({
    width: windowBounds.width,
    height: windowBounds.height,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // Required for local development with file:// protocol
      allowRunningInsecureContent: true // Bypasses strict Chromium network blocks
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.openDevTools();

  mainWindow.on('close', (event) => {
    if (roomState.currentRoom) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'Active Room',
        message: 'You have an active room. Closing the app will disconnect all participants.',
        detail: 'Are you sure you want to exit?',
        buttons: ['Cancel', 'Exit'],
        defaultId: 0,
        cancelId: 0
      });
      if (choice === 0) {
        event.preventDefault();
        return;
      }
    }
    
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', bounds);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
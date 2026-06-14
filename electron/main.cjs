const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;

let mainWindow = null;
let viteProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Link Fortress IT Solutions',
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f172a',
    show: false,
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  if (isDev) {
    // In development, start Vite dev server first then load it
    startViteDevServer().then(() => {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools({ mode: 'bottom' });
    });
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle('window:get-state', () => ({
  isMaximized: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false,
}));

ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

function startViteDevServer() {
  return new Promise((resolve, reject) => {
    if (viteProcess) {
      resolve();
      return;
    }

    const viteBin = process.platform === 'win32'
      ? path.join(__dirname, '..', 'node_modules', '.bin', 'vite.cmd')
      : path.join(__dirname, '..', 'node_modules', '.bin', 'vite');
    viteProcess = spawn(viteBin, ['--port=3000', '--host=127.0.0.1'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let started = false;

    viteProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Vite] ${output}`);
      if (!started && (output.includes('Local:') || output.includes('ready in'))) {
        started = true;
        // Give Vite a moment to fully initialize
        setTimeout(resolve, 500);
      }
    });

    viteProcess.stderr.on('data', (data) => {
      console.error(`[Vite Error] ${data}`);
    });

    viteProcess.on('error', (err) => {
      console.error('Failed to start Vite:', err);
      reject(err);
    });

    viteProcess.on('exit', (code) => {
      console.log(`Vite exited with code ${code}`);
      viteProcess = null;
      if (!started) reject(new Error('Vite exited before starting'));
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!started) reject(new Error('Vite dev server failed to start within 15 seconds'));
    }, 15000);
  });
}

function stopViteDevServer() {
  if (viteProcess) {
    viteProcess.kill('SIGTERM');
    viteProcess = null;
  }
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopViteDevServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  stopViteDevServer();
});

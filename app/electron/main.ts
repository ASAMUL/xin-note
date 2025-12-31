import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js
// │ ├─┬ preload
// │ │ └── index.js
// │ ├─┬ renderer
// │ │ └── index.html
process.env.APP_ROOT = path.join(import.meta.dirname, '..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, '.output/public');

process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  // Use the display nearest to current cursor (better for multi-monitor setups).
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  const width = Math.max(800, Math.round(screenWidth * 0.8));
  const height = Math.max(600, Math.round(screenHeight * 0.8));

  win = new BrowserWindow({
    width,
    height,
    frame: false, // 关键：去掉了原生标题栏和边框
    transparent: true,
    center: true,
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.VITE_PUBLIC!, 'index.html'));
  }
}

function initIpc() {
  ipcMain.handle('app-start-time', () => new Date().toLocaleString());

  // 窗口控制
  ipcMain.on('window-minimize', () => {
    win?.minimize();
  });

  ipcMain.on('window-toggle-maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    win?.close();
  });

  // 监听窗口最大化状态变化，通知渲染进程
  ipcMain.handle('window-is-maximized', () => {
    return win?.isMaximized() ?? false;
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  initIpc();
  createWindow();
});

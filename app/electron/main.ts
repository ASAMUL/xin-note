import { app, BrowserWindow, ipcMain, screen, dialog, shell, clipboard, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, statSync, readdirSync } from 'node:fs';

/**
 * 让渲染进程可以安全加载本地 assets 图片：
 * - dev 时渲染页是 http://localhost，Chromium 会禁止直接加载 file:///...
 * - 通过自定义协议 lumina-asset:// 映射到本地文件，避免 “Not allowed to load local resource”
 *
 * 注意：registerSchemesAsPrivileged 必须在 app ready 之前调用
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lumina-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

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

function registerAssetProtocol() {
  // 允许通过 <img src="lumina-asset://local/<encodedAbsPath>"> 加载本地图片
  // - encodedAbsPath = encodeURIComponent('C:/.../assets/xxx.png')
  protocol.registerFileProtocol('lumina-asset', (request, callback) => {
    try {
      const u = new URL(request.url);
      let filePath = '';

      // 推荐格式：lumina-asset://local/<encodedAbsPath>
      if (u.hostname === 'local') {
        const encoded = (u.pathname || '').replace(/^\/+/, ''); // 去掉前导 /
        const decoded = decodeURIComponent(encoded);
        filePath = path.normalize(decoded);
      } else {
        // 兼容旧格式/异常解析：lumina-asset://c/Users/... （盘符被当成 host）
        // 还原为 C:/Users/...
        const host = (u.hostname || '').toString();
        const pathname = decodeURIComponent(u.pathname || '');
        if (/^[a-z]$/i.test(host)) {
          filePath = path.normalize(`${host.toUpperCase()}:${pathname}`);
        } else {
          // 兜底：尝试直接把 pathname 当路径
          filePath = path.normalize(pathname);
        }
      }

      // 安全兜底：仅允许访问 assets 目录下的文件
      if (!/(^|[\\/])assets[\\/]/i.test(filePath)) {
        console.warn('[lumina-asset] blocked path:', filePath);
        return callback({ error: -10 }); // net::ERR_ACCESS_DENIED
      }

      return callback({ path: filePath });
    } catch (error) {
      console.error('[lumina-asset] resolve error:', error);
      return callback({ error: -324 }); // net::ERR_INVALID_URL
    }
  });
}

function createWindow() {
  // Use the display nearest to current cursor (better for multi-monitor setups).
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  const width = Math.max(800, Math.round(screenWidth * 0.8));
  const height = Math.max(600, Math.round(screenHeight * 0.8));

  win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    center: true,
    show: false, // 初始隐藏，等待内容加载后显示
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.js'),
    },
  });

  // 窗口淡入动画：内容加载完成后优雅显示
  win.once('ready-to-show', () => {
    if (!win) return;

    // 先设置透明度为 0
    win.setOpacity(0);
    win.show();

    // 使用动画逐渐增加透明度实现淡入效果
    let opacity = 0;
    const fadeIn = setInterval(() => {
      if (!win) {
        clearInterval(fadeIn);
        return;
      }
      opacity += 0.1;
      if (opacity >= 1) {
        opacity = 1;
        clearInterval(fadeIn);
      }
      win.setOpacity(opacity);
    }, 25); // 约 250ms 完成淡入
  });

  // 在主进程捕获快捷键，然后通过 IPC 发送给渲染进程
  // 这是在 Electron 中处理自定义快捷键的正确方式
  win.webContents.on('before-input-event', (event, input) => {
    // 只处理按键按下事件
    if (input.type !== 'keyDown') return;

    // 检测修饰键（Ctrl 或 Cmd）
    const isModKey = input.control || input.meta;

    // Ctrl/Cmd + P - 打开搜索面板
    if (isModKey && input.key.toLowerCase() === 'p') {
      event.preventDefault();
      win?.webContents.send('shortcut-triggered', 'open-search');
      return;
    }

    // Ctrl/Cmd + N - 新建笔记
    if (isModKey && input.key.toLowerCase() === 'n') {
      event.preventDefault();
      win?.webContents.send('shortcut-triggered', 'create-note');
      return;
    }
    // Ctrl/Cmd + , - 打开设置
    if (isModKey && input.key === ',') {
      event.preventDefault();
      win?.webContents.send('shortcut-triggered', 'open-settings');
      return;
    }

    // Ctrl/Cmd + S - 保存当前笔记
    if (isModKey && input.key.toLowerCase() === 's') {
      event.preventDefault();
      win?.webContents.send('shortcut-triggered', 'save-note');
      return;
    }
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

  // ========== 文件操作 IPC ==========

  // 选择文件夹对话框
  ipcMain.handle('dialog-select-folder', async () => {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择笔记存储目录',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // 读取目录内容
  ipcMain.handle('dir-read', async (_event, dirPath: string) => {
    try {
      if (!existsSync(dirPath)) return [];

      const entries = readdirSync(dirPath, { withFileTypes: true });
      const items = entries
        .filter((entry) => entry.isDirectory() || entry.name.endsWith('.md'))
        .map((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const isFolder = entry.isDirectory();

          let children: any[] | undefined;
          if (isFolder) {
            // 递归读取子目录
            const subEntries = readdirSync(fullPath, { withFileTypes: true });
            children = subEntries
              .filter((sub) => sub.isDirectory() || sub.name.endsWith('.md'))
              .map((sub) => ({
                id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
                name: sub.name,
                path: path.join(fullPath, sub.name),
                isFolder: sub.isDirectory(),
                children: sub.isDirectory() ? [] : undefined,
              }));
          }

          return {
            id: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
            name: entry.name,
            path: fullPath,
            isFolder,
            children,
          };
        });

      return items;
    } catch (error) {
      console.error('读取目录失败:', error);
      return [];
    }
  });

  // 读取文件内容
  ipcMain.handle('file-read', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('读取文件失败:', error);
      return null;
    }
  });

  // 写入文件内容
  ipcMain.handle(
    'file-write',
    async (_event, { path: filePath, content }: { path: string; content: string }) => {
      try {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
      } catch (error) {
        console.error('写入文件失败:', error);
        return false;
      }
    },
  );

  /**
   * 写入当前笔记目录下的 assets 文件（图片等二进制资源）
   * - 策略：与 markdown 同目录创建 `assets/`
   * - 返回：可直接写入 markdown 的相对路径：`assets/<fileName>`
   */
  ipcMain.handle(
    'asset-write',
    async (
      _event,
      {
        notePath,
        fileName,
        data,
      }: { notePath: string; fileName: string; data: ArrayBuffer | Uint8Array | number[] },
    ) => {
      try {
        const noteDir = path.dirname(notePath);
        const assetsDir = path.join(noteDir, 'assets');
        await fs.mkdir(assetsDir, { recursive: true });

        const absPath = path.join(assetsDir, fileName);
        // 兼容 ArrayBuffer / Uint8Array / number[] 三种数据形态
        const buffer = Buffer.isBuffer(data)
          ? data
          : data instanceof Uint8Array
            ? Buffer.from(data)
            : data instanceof ArrayBuffer
              ? Buffer.from(new Uint8Array(data))
              : Buffer.from(data);

        await fs.writeFile(absPath, buffer);

        return {
          ok: true,
          absPath,
          relativePath: path.posix.join('assets', fileName),
        };
      } catch (error) {
        console.error('写入 assets 资源失败:', error);
        return { ok: false };
      }
    },
  );

  // 创建新文件
  ipcMain.handle(
    'file-create',
    async (
      _event,
      { directory, fileName, content }: { directory: string; fileName: string; content: string },
    ) => {
      try {
        const filePath = path.join(directory, fileName);

        // 检查文件是否已存在，如果存在则添加数字后缀
        let finalPath = filePath;
        let counter = 1;
        while (existsSync(finalPath)) {
          const ext = path.extname(fileName);
          const baseName = path.basename(fileName, ext);
          finalPath = path.join(directory, `${baseName} (${counter})${ext}`);
          counter++;
        }

        await fs.writeFile(finalPath, content, 'utf-8');
        return finalPath;
      } catch (error) {
        console.error('创建文件失败:', error);
        return null;
      }
    },
  );

  // 检查文件是否存在
  ipcMain.handle('file-exists', async (_event, filePath: string) => {
    try {
      return existsSync(filePath);
    } catch (error) {
      console.error('检查文件是否存在失败:', error);
      return false;
    }
  });

  // 获取文件元数据（创建时间、修改时间）
  ipcMain.handle('file-stat', async (_event, filePath: string) => {
    try {
      const stat = statSync(filePath);
      return {
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch (error) {
      console.error('获取文件元数据失败:', error);
      return null;
    }
  });

  // 删除文件或文件夹（递归删除）
  ipcMain.handle('file-delete', async (_event, filePath: string) => {
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        // 递归删除文件夹及其所有内容
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        // 删除单个文件
        await fs.unlink(filePath);
      }
      return true;
    } catch (error) {
      console.error('删除文件/文件夹失败:', error);
      return false;
    }
  });

  // 重命名文件
  ipcMain.handle(
    'file-rename',
    async (_event, { oldPath, newName }: { oldPath: string; newName: string }) => {
      try {
        const dir = path.dirname(oldPath);
        const newPath = path.join(dir, newName);

        if (existsSync(newPath)) {
          throw new Error('文件名已存在');
        }

        await fs.rename(oldPath, newPath);
        return newPath;
      } catch (error) {
        console.error('重命名文件失败:', error);
        return null;
      }
    },
  );

  // 在资源管理器中显示文件
  ipcMain.handle('file-show-in-explorer', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // 写入剪贴板
  ipcMain.handle('clipboard-write', async (_event, text: string) => {
    clipboard.writeText(text);
  });

  // 移动文件或文件夹
  ipcMain.handle(
    'file-move',
    async (_event, { sourcePath, targetDir }: { sourcePath: string; targetDir: string }) => {
      try {
        const fileName = path.basename(sourcePath);
        let newPath = path.join(targetDir, fileName);

        // 如果目标路径已存在，添加数字后缀
        let counter = 1;
        while (existsSync(newPath)) {
          const ext = path.extname(fileName);
          const baseName = path.basename(fileName, ext);
          newPath = path.join(targetDir, `${baseName} (${counter})${ext}`);
          counter++;
        }

        await fs.rename(sourcePath, newPath);
        return newPath;
      } catch (error) {
        console.error('移动文件失败:', error);
        return null;
      }
    },
  );

  // 创建文件夹
  ipcMain.handle(
    'dir-create',
    async (_event, { directory, folderName }: { directory: string; folderName: string }) => {
      try {
        let folderPath = path.join(directory, folderName);

        // 如果文件夹已存在，添加数字后缀
        let counter = 1;
        while (existsSync(folderPath)) {
          folderPath = path.join(directory, `${folderName} (${counter})`);
          counter++;
        }

        await fs.mkdir(folderPath, { recursive: true });
        return folderPath;
      } catch (error) {
        console.error('创建文件夹失败:', error);
        return null;
      }
    },
  );

  // ========== 配置文件操作 IPC ==========

  // 获取用户数据目录
  ipcMain.handle('get-user-data-path', () => {
    return app.getPath('userData');
  });

  // 读取配置文件
  ipcMain.handle('config-read', async (_event, fileName: string) => {
    try {
      const configPath = path.join(app.getPath('userData'), fileName);
      console.log('读取配置文件:', configPath);
      if (!existsSync(configPath)) return null;
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('读取配置文件失败:', error);
      return null;
    }
  });

  // 写入配置文件
  ipcMain.handle(
    'config-write',
    async (_event, { fileName, data }: { fileName: string; data: any }) => {
      try {
        const configDir = app.getPath('userData');
        // 确保目录存在
        if (!existsSync(configDir)) {
          await fs.mkdir(configDir, { recursive: true });
        }
        const configPath = path.join(configDir, fileName);
        await fs.writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
      } catch (error) {
        console.error('写入配置文件失败:', error);
        return false;
      }
    },
  );
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
  registerAssetProtocol();
  initIpc();
  createWindow();
});

import { ipcMain, clipboard, shell } from 'electron';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import fs from 'fs/promises';
export function setupFileIpc() {
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
        notesRoot,
        data,
      }: {
        notePath: string;
        fileName: string;
        notesRoot?: string | null;
        data: ArrayBuffer | Uint8Array | number[];
      },
    ) => {
      try {
        // 资源目录策略：优先使用“笔记根目录（notesDirectory）/assets”
        // - 这样笔记移动到子目录/兄弟目录后，不需要复制 assets
        // - markdown 仍然保持 `assets/<fileName>` 这种稳定引用
        const baseDir = notesRoot || path.dirname(notePath);
        const assetsDir = path.join(baseDir, 'assets');
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
}

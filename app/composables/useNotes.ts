/**
 * 笔记管理 composable
 * 负责笔记的创建、读取、写入、删除等操作
 */

export interface NoteItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children?: NoteItem[];
  isModified?: boolean;
  content?: string;
  expanded?: boolean; // 控制文件夹展开/折叠状态
}

export interface NoteState {
  notes: NoteItem[];
  activeNote: NoteItem | null;
  isLoading: boolean;
}

export function useNotes() {
  const { notesDirectory } = useSettings();

  // 笔记状态
  const state = useState<NoteState>('notes-state', () => ({
    notes: [],
    activeNote: null,
    isLoading: false,
  }));

  // 生成唯一 ID
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  // 加载笔记目录
  const loadNotes = async () => {
    if (!notesDirectory.value || !window.ipcRenderer) {
      state.value.notes = [];
      return;
    }

    state.value.isLoading = true;
    try {
      const items = await window.ipcRenderer.invoke('dir-read', notesDirectory.value);
      state.value.notes = items || [];
    } catch (error) {
      console.error('加载笔记失败:', error);
      state.value.notes = [];
    } finally {
      state.value.isLoading = false;
    }
  };

  // 创建新笔记
  const createNote = async (
    name: string = '未命名笔记.md',
    parentDir?: string,
  ): Promise<NoteItem | null> => {
    const targetDir = parentDir || notesDirectory.value;
    if (!targetDir || !window.ipcRenderer) return null;

    try {
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const filePath = await window.ipcRenderer.invoke('file-create', {
        directory: targetDir,
        fileName,
        content: `# ${name.replace('.md', '')}\n\n`,
      });

      if (filePath) {
        const newNote: NoteItem = {
          id: generateId(),
          name: fileName,
          path: filePath,
          isFolder: false,
          isModified: false,
          content: `# ${name.replace('.md', '')}\n\n`,
        };

        // 刷新笔记列表
        await loadNotes();

        // 自动打开新创建的笔记
        await openNote(newNote);

        return newNote;
      }
    } catch (error) {
      console.error('创建笔记失败:', error);
    }
    return null;
  };

  // 打开笔记
  const openNote = async (note: NoteItem) => {
    if (note.isFolder || !window.ipcRenderer) return;

    try {
      const content = await window.ipcRenderer.invoke('file-read', note.path);
      state.value.activeNote = {
        ...note,
        content: content || '',
        isModified: false,
      };
    } catch (error) {
      console.error('打开笔记失败:', error);
    }
  };

  // 保存笔记
  const saveNote = async (note?: NoteItem): Promise<boolean> => {
    const targetNote = note || state.value.activeNote;
    if (!targetNote || !window.ipcRenderer) return false;

    try {
      await window.ipcRenderer.invoke('file-write', {
        path: targetNote.path,
        content: targetNote.content || '',
      });

      // 更新修改状态
      if (state.value.activeNote?.id === targetNote.id) {
        state.value.activeNote.isModified = false;
      }

      return true;
    } catch (error) {
      console.error('保存笔记失败:', error);
      return false;
    }
  };

  // 更新笔记内容（标记为已修改）
  const updateNoteContent = (content: string) => {
    if (state.value.activeNote) {
      state.value.activeNote.content = content;
      state.value.activeNote.isModified = true;
    }
  };

  // 重命名笔记
  const renameNote = async (note: NoteItem, newName: string): Promise<boolean> => {
    if (!window.ipcRenderer) return false;

    try {
      const oldPath = note.path;
      // 文件：自动补齐 .md；文件夹：保持原样（避免把文件夹误改成 *.md）
      const normalizedName = note.isFolder
        ? newName
        : newName.endsWith('.md')
          ? newName
          : `${newName}.md`;

      const newPath = await window.ipcRenderer.invoke('file-rename', {
        oldPath,
        newName: normalizedName,
      });

      if (newPath) {
        
        const { renameTabByPath, renameTabsByFolder } = useTabs();
        if (note.isFolder) {
          await renameTabsByFolder(oldPath, newPath);
        } else {
          await renameTabByPath(oldPath, newPath, normalizedName);
        }

        // 兼容旧逻辑：如果某处仍使用 activeNote，则同步更新（按 path 判断更稳）
        if (state.value.activeNote && state.value.activeNote.path === oldPath) {
          state.value.activeNote.name = normalizedName;
          state.value.activeNote.path = newPath;
        }

        // 刷新笔记列表
        await loadNotes();
        return true;
      }
    } catch (error) {
      console.error('重命名笔记失败:', error);
    }
    return false;
  };

  // 删除笔记或文件夹
  const deleteNote = async (note: NoteItem): Promise<boolean> => {
    if (!window.ipcRenderer) return false;

    try {
      const success = await window.ipcRenderer.invoke('file-delete', note.path);

      if (success) {
        // 如果删除的是当前活动笔记，清空活动状态
        if (state.value.activeNote?.id === note.id) {
          state.value.activeNote = null;
        }

        // 同步关闭对应的标签页
        const { closeTabByPath, openTabs } = useTabs();

        if (note.isFolder) {
          // 如果删除的是文件夹，关闭该文件夹内所有打开的标签页
          const folderPath = note.path;
          const tabsToClose = openTabs.value.filter(
            (tab: { path: string }) =>
              tab.path.startsWith(folderPath + '\\') || tab.path.startsWith(folderPath + '/'),
          );
          for (const tab of tabsToClose) {
            await closeTabByPath(tab.path);
          }
        } else {
          // 删除单个文件，关闭对应标签页
          await closeTabByPath(note.path);
        }

        // 刷新笔记列表
        await loadNotes();
        return true;
      }
    } catch (error) {
      console.error('删除笔记/文件夹失败:', error);
    }
    return false;
  };

  // 在资源管理器中显示
  const showInExplorer = async (note: NoteItem) => {
    if (!window.ipcRenderer) return;
    await window.ipcRenderer.invoke('file-show-in-explorer', note.path);
  };

  // 复制文件路径
  const copyPath = async (note: NoteItem) => {
    if (!window.ipcRenderer) return;
    await window.ipcRenderer.invoke('clipboard-write', note.path);
  };

  // 移动笔记到目标文件夹
  const moveNote = async (note: NoteItem, targetFolderPath: string): Promise<boolean> => {
    if (!window.ipcRenderer) return false;

    try {
      const oldPath = note.path;
      const newPath = await window.ipcRenderer.invoke('file-move', {
        sourcePath: oldPath,
        targetDir: targetFolderPath,
      });

      if (newPath) {
        // 同步更新已打开的标签页路径（否则自动保存会写到旧路径）
        const { renameTabByPath, renameTabsByFolder } = useTabs();
        if (note.isFolder) {
          await renameTabsByFolder(oldPath, newPath);
        } else {
          const name = newPath.replace(/\\/g, '/').split('/').pop() || note.name;
          await renameTabByPath(oldPath, newPath, name);
        }

        // 兼容旧逻辑：如果某处仍使用 activeNote，则同步更新（按 path 判断更稳）
        if (state.value.activeNote && state.value.activeNote.path === oldPath) {
          state.value.activeNote.path = newPath;
          if (!note.isFolder) {
            state.value.activeNote.name = newPath.replace(/\\/g, '/').split('/').pop() || state.value.activeNote.name;
          }
        }

        // 刷新笔记列表
        await loadNotes();
        return true;
      }
    } catch (error) {
      console.error('移动笔记失败:', error);
    }
    return false;
  };

  // 创建新文件夹
  const createFolder = async (
    name: string = '新建文件夹',
    parentDir?: string,
  ): Promise<string | null> => {
    const targetDir = parentDir || notesDirectory.value;
    if (!targetDir || !window.ipcRenderer) return null;

    try {
      const folderPath = await window.ipcRenderer.invoke('dir-create', {
        directory: targetDir,
        folderName: name,
      });

      if (folderPath) {
        // 刷新笔记列表
        await loadNotes();
        return folderPath;
      }
    } catch (error) {
      console.error('创建文件夹失败:', error);
    }
    return null;
  };

  // 监听笔记目录变化
  watch(
    notesDirectory,
    () => {
      loadNotes();
    },
    { immediate: true },
  );

  return {
    notes: computed(() => state.value.notes),
    activeNote: computed(() => state.value.activeNote),
    isLoading: computed(() => state.value.isLoading),
    hasActiveNote: computed(() => !!state.value.activeNote),
    isModified: computed(() => state.value.activeNote?.isModified ?? false),
    loadNotes,
    createNote,
    createFolder,
    openNote,
    saveNote,
    updateNoteContent,
    renameNote,
    deleteNote,
    moveNote,
    showInExplorer,
    copyPath,
  };
}

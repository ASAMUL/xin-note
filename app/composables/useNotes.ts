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
  const createNote = async (name: string = '未命名笔记.md'): Promise<NoteItem | null> => {
    if (!notesDirectory.value || !window.ipcRenderer) return null;

    try {
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const filePath = await window.ipcRenderer.invoke('file-create', {
        directory: notesDirectory.value,
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
      const newPath = await window.ipcRenderer.invoke('file-rename', {
        oldPath: note.path,
        newName: newName.endsWith('.md') ? newName : `${newName}.md`,
      });

      if (newPath) {
        // 更新活动笔记
        if (state.value.activeNote?.id === note.id) {
          state.value.activeNote.name = newName;
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

  // 删除笔记
  const deleteNote = async (note: NoteItem): Promise<boolean> => {
    if (!window.ipcRenderer) return false;

    try {
      const success = await window.ipcRenderer.invoke('file-delete', note.path);

      if (success) {
        // 如果删除的是当前活动笔记，清空活动状态
        if (state.value.activeNote?.id === note.id) {
          state.value.activeNote = null;
        }

        // 刷新笔记列表
        await loadNotes();
        return true;
      }
    } catch (error) {
      console.error('删除笔记失败:', error);
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
    openNote,
    saveNote,
    updateNoteContent,
    renameNote,
    deleteNote,
    showInExplorer,
    copyPath,
  };
}

import type { Ref } from 'vue';
import type { EditorCustomHandlers } from '#ui/types/editor';
import type { Editor } from '@tiptap/vue-3';
import type { TabItem } from '~/composables/useTabs';

/**
 * 本地图片写入与显示（Electron）
 * - 上传/粘贴图片：写入笔记根目录（notesDirectory）下的 assets/，并在 markdown 里插入相对路径
 * - 显示层：把 assets/xxx.png 解析成 lumina-asset://...（避免 dev 下 file:/// 被 Chromium 禁止）
 */
export const useEditorLocalImages = (params: {
  activeTab: Ref<TabItem | null>;
  editorRef: Ref<{ editor: Editor } | null>;
}) => {
  const { activeTab, editorRef } = params;
  const { notesDirectory } = useSettings();

  // 将 markdown 的相对路径 assets/xxx.png 解析为可在 Electron 中加载的 URL（dev 下不能直接用 file:///）
  const resolveLocalImageSrc = (src: string) => {
    if (!src) return null;
    // 已经是完整 URL：不处理
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return null;

    const notePath = activeTab.value?.path;
    if (!notePath) return null;

    const noteDir = notePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const rel = src.replace(/\\/g, '/').replace(/^\.\/+/, '');
    // 只处理写入到笔记同目录 assets/ 的资源（其余相对路径不保证可访问）
    if (!rel.startsWith('assets/')) return null;
    const abs = `${noteDir}/${rel}`.replace(/\/{2,}/g, '/');

    // dev 环境下渲染页是 http://localhost，Chromium 会禁止加载 file:///...
    // 统一改用自定义协议 lumina-asset://（主进程已注册映射到本地文件）
    // 注意：不要使用 lumina-asset:///C:/... 这种形式，标准协议下会被解析成 lumina-asset://c/...（盘符被误当 host）
    return `lumina-asset://local/${encodeURIComponent(abs)}`;
  };

  /**
   * 选择本地图片并插入到当前笔记：
   * - 通过 <input type="file"> 选择图片
   * - 使用 Electron IPC `asset-write` 写入当前笔记同目录 `assets/`
   * - 在 markdown 里插入相对路径 `assets/<fileName>`（显示层由 LocalImageResolver 转成 lumina-asset://...）
   */
  const pickImageFile = (accept = 'image/*') => {
    return new Promise<File | null>((resolve) => {
      // 仅在客户端可用
      if (typeof window === 'undefined') return resolve(null);

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = false;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '-9999px';

      const cleanup = () => {
        input.remove();
        window.removeEventListener('focus', onFocus);
      };

      const finish = (file: File | null) => {
        cleanup();
        resolve(file);
      };

      const onChange = () => {
        const file = input.files?.[0] || null;
        finish(file);
      };

      // 用户取消选择时不会触发 change；通过 focus 回来时兜底 resolve(null)
      const onFocus = () => {
        // 等待一帧，确保 file dialog 已经关闭
        setTimeout(() => {
          if (!input.files || input.files.length === 0) finish(null);
        }, 0);
      };

      input.addEventListener('change', onChange, { once: true });
      window.addEventListener('focus', onFocus, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertLocalImageToNote = async (editor: any, file: File) => {
    if (!activeTab.value?.path) return;
    if (typeof window === 'undefined' || !window.ipcRenderer) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'png';
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fileName = `${unique}-upload.${ext}`;

      const result = await window.ipcRenderer.invoke('asset-write', {
        notePath: activeTab.value.path,
        notesRoot: notesDirectory.value,
        fileName,
        data: new Uint8Array(arrayBuffer),
      });

      if (!result?.ok || !result?.relativePath) {
        throw new Error('写入图片失败');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = editor as any;
      e.chain()
        .focus()
        .setImage({
          src: result.relativePath,
          alt: file.name || 'uploaded image',
        })
        .run();
    } catch (err) {
      console.error('插入图片失败:', err);
    }
  };

  // 粘贴图片：写入当前笔记同目录 assets/ 并插入 image 节点（markdown 里保存相对路径）
  const handlePaste = async (e: ClipboardEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = editorRef.value?.editor as any;
    if (!editor) return;
    if (!activeTab.value?.path) return;
    if (!window.ipcRenderer) return;

    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageItem = Array.from(items).find((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'png';
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fileName = `${unique}-pasted.${ext}`;

      const result = await window.ipcRenderer.invoke('asset-write', {
        notePath: activeTab.value.path,
        notesRoot: notesDirectory.value,
        fileName,
        data: new Uint8Array(arrayBuffer),
      });

      if (!result?.ok || !result?.relativePath) {
        throw new Error('写入图片失败');
      }

      editor
        .chain()
        .focus()
        .setImage({
          src: result.relativePath,
          alt: file.name || 'pasted image',
        })
        .run();
    } catch (err) {
      console.error('粘贴图片失败:', err);
    }
  };

  const imageHandlers = computed(() => {
    const handlers: EditorCustomHandlers = {
      imageUpload: {
        canExecute: (editor, _cmd) =>
          !!activeTab.value?.path && typeof window !== 'undefined' && !!window.ipcRenderer && editor.isEditable,
        execute: (editor, _cmd) => {
          // 通过文件选择对话框上传图片并写入当前笔记 assets/，插入 markdown 相对路径
          void (async () => {
            const file = await pickImageFile('image/*');
            if (!file) return;
            await insertLocalImageToNote(editor, file);
          })();

          // 返回 chain 以满足 Nuxt UI Editor 的 handler 约定（真正插入在异步回调里完成）
          return (editor as any).chain();
        },
        // 这是一个“动作按钮”，不需要 active 态（避免选中图片时误高亮）
        isActive: () => false,
      },
    };

    return handlers;
  });

  return {
    resolveLocalImageSrc,
    handlePaste,
    imageHandlers,
  };
};


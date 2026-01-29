import type { Ref } from 'vue';
import type { EditorCustomHandlers } from '#ui/types/editor';
import FileHandler from '@tiptap/extension-file-handler';
import type { TabItem } from '~/composables/useTabs';

type LocalImageWriteKind = 'upload' | 'pasted' | 'dropped';

interface WrittenAsset {
  file: File;
  relativePath: string;
}

/**
 * 本地图片写入与显示（Electron）
 * - 上传/粘贴/拖拽图片：写入笔记根目录（notesDirectory）下的 assets/，并在 markdown 里插入相对路径
 * - 显示层：把 assets/xxx.png 解析成 lumina-asset://...（避免 dev 下 file:/// 被 Chromium 禁止）
 */
export const useEditorLocalImages = (params: { activeTab: Ref<TabItem | null> }) => {
  const { activeTab } = params;
  const { notesDirectory } = useSettings();

  const getNotesRoot = () => {
    const raw = notesDirectory.value;
    if (typeof raw !== 'string') return '';
    return raw.trim();
  };

  // 将 markdown 的相对路径 assets/xxx.png 解析为可在 Electron 中加载的 URL（dev 下不能直接用 file:///）
  const resolveLocalImageSrc = (src: string) => {
    if (!src) return null;
    // 已经是完整 URL：不处理
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:'))
      return null;

    const notePath = activeTab.value?.path;
    if (!notePath) return null;

    const rel = src.replace(/\\/g, '/').replace(/^\.\/+/, '');
    // 只处理写入到 assets/ 下的资源（其余相对路径不保证可访问）
    if (!rel.startsWith('assets/')) return null;

    const noteDir = notePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const notesRoot = getNotesRoot().replace(/\\/g, '/');
    const baseDir = notesRoot || noteDir;
    const abs = `${baseDir}/${rel}`.replace(/\/{2,}/g, '/');

    // dev 环境下渲染页是 http://localhost，Chromium 会禁止加载 file:///...
    // 统一改用自定义协议 lumina-asset://（主进程已注册映射到本地文件）
    // 注意：不要使用 lumina-asset:///C:/... 这种形式，标准协议下会被解析成 lumina-asset://c/...（盘符被误当 host）
    return `lumina-asset://local/${encodeURIComponent(abs)}`;
  };

  const normalizeExt = (ext: string) => {
    const cleaned = ext
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '');
    return cleaned || null;
  };

  const getExtFromFileName = (fileName: string) => {
    const name = (fileName || '').trim();
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return null;
    return normalizeExt(name.slice(dot + 1));
  };

  const getExtFromMime = (mime: string) => {
    if (!mime) return null;
    if (!mime.startsWith('image/')) return null;

    const subtype = mime.slice('image/'.length).split(';')[0] || '';
    const base = subtype.split('+')[0] || subtype;
    const normalized = normalizeExt(base);
    if (!normalized) return null;

    // 常见别名/特殊类型
    if (normalized === 'xicon' || normalized === 'vndmicrosofticon') return 'ico';
    return normalized;
  };

  const IMAGE_EXTS = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'svg',
    'ico',
    'avif',
    'tif',
    'tiff',
  ]);

  const isImageFile = (file: File) => {
    if (file.type?.startsWith('image/')) return true;
    const ext = getExtFromFileName(file.name);
    return !!ext && IMAGE_EXTS.has(ext);
  };

  const createAssetFileName = (file: File, kind: LocalImageWriteKind, index: number) => {
    const ext = getExtFromFileName(file.name) || getExtFromMime(file.type) || 'png';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`;
    return `${unique}-${kind}.${ext}`;
  };

  const writeImageFilesToAssets = async (
    files: File[],
    kind: LocalImageWriteKind,
  ): Promise<WrittenAsset[]> => {
    const notePath = activeTab.value?.path;
    if (!notePath) return [];
    if (typeof window === 'undefined' || !window.ipcRenderer) return [];

    const notesRoot = getNotesRoot();

    const tasks = files.map(async (file, index) => {
      const arrayBuffer = await file.arrayBuffer();
      const fileName = createAssetFileName(file, kind, index);

      const result = await window.ipcRenderer.invoke('asset-write', {
        notePath,
        notesRoot: notesRoot || undefined,
        fileName,
        data: new Uint8Array(arrayBuffer),
      });

      if (!result?.ok || !result?.relativePath) {
        throw new Error('写入图片失败');
      }

      return { file, relativePath: result.relativePath } as WrittenAsset;
    });

    const settled = await Promise.allSettled(tasks);

    const written: WrittenAsset[] = [];
    settled.forEach((item, idx) => {
      if (item.status === 'fulfilled') {
        written.push(item.value);
      } else {
        const file = files[idx];
        console.error('写入图片失败:', { fileName: file?.name, error: item.reason });
      }
    });

    return written;
  };

  const getDefaultAlt = (kind: LocalImageWriteKind) => {
    if (kind === 'upload') return 'uploaded image';
    if (kind === 'pasted') return 'pasted image';
    return 'dropped image';
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertWrittenImages = (
    editor: any,
    assets: WrittenAsset[],
    kind: LocalImageWriteKind,
    pos?: number,
  ) => {
    if (!assets.length) return;

    const defaultAlt = getDefaultAlt(kind);

    // drop/pure paste：用固定 pos；rich paste：用当前 selection（pos 为空时）
    let chain = editor.chain().focus();
    if (typeof pos === 'number') {
      // setTextSelection 会把 pos clamp 到可用范围（避免 0/越界）
      chain = chain.setTextSelection(pos);
    }

    assets.forEach(({ file, relativePath }) => {
      chain = chain.setImage({
        src: relativePath,
        alt: (file.name || '').trim() || defaultAlt,
      });
    });

    chain.run();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertImagesFromFiles = async (
    editor: any,
    files: File[],
    kind: LocalImageWriteKind,
    pos?: number,
  ) => {
    const images = files.filter(isImageFile);
    if (images.length === 0) return;

    const assets = await writeImageFilesToAssets(images, kind);
    if (assets.length === 0) return;

    insertWrittenImages(editor, assets, kind, pos);
  };

  /**
   * 选择本地图片并插入到当前笔记：
   * - 通过 <input type="file"> 选择图片
   * - 使用 Electron IPC `asset-write` 写入笔记根目录（notesDirectory）下的 `assets/`
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
        }, 80);
      };

      input.addEventListener('change', onChange, { once: true });
      window.addEventListener('focus', onFocus, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  };

  const fileHandlerExtension = computed(() => {
    return FileHandler.configure({
      onPaste: (editor, files, pasteContent) => {
        if (!activeTab.value?.path) return;
        if (typeof window === 'undefined' || !window.ipcRenderer) return;

        const hasHtml = typeof pasteContent === 'string' && pasteContent.length > 0;

        // 纯图片粘贴：固定锚点，避免异步导致位置漂移
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anchorPos = hasHtml ? undefined : (editor as any).state.selection.from;

        void (async () => {
          try {
            const assets = await writeImageFilesToAssets(files.filter(isImageFile), 'pasted');
            if (assets.length === 0) return;

            if (hasHtml) {
              // 富文本粘贴：让默认粘贴先完成，再在当前 selection 插入（极少数场景可能出现重复图片）
              insertWrittenImages(editor as any, assets, 'pasted');
              return;
            }

            insertWrittenImages(editor as any, assets, 'pasted', anchorPos);
          } catch (err) {
            console.error('粘贴图片失败:', err);
          }
        })();
      },
      onDrop: (editor, files, pos) => {
        if (!activeTab.value?.path) return;
        if (typeof window === 'undefined' || !window.ipcRenderer) return;

        void (async () => {
          try {
            await insertImagesFromFiles(editor as any, files, 'dropped', pos);
          } catch (err) {
            console.error('拖拽图片失败:', err);
          }
        })();
      },
    });
  });

  const imageHandlers = computed(() => {
    const handlers: EditorCustomHandlers = {
      imageUpload: {
        canExecute: (editor, _cmd) =>
          !!activeTab.value?.path &&
          typeof window !== 'undefined' &&
          !!window.ipcRenderer &&
          editor.isEditable,
        execute: (editor, _cmd) => {
          // 通过文件选择对话框上传图片并写入 assets/，插入 markdown 相对路径
          void (async () => {
            try {
              const file = await pickImageFile('image/*');
              if (!file) return;
              await insertImagesFromFiles(editor as any, [file], 'upload');
            } catch (err) {
              console.error('上传图片失败:', err);
            }
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
    fileHandlerExtension,
    imageHandlers,
  };
};

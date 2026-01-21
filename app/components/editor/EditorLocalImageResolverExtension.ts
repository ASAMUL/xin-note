import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export interface LocalImageResolverOptions {
  /**
   * 把原始 src（通常是 markdown 里的相对路径 assets/xxx.png）解析为可显示的 URL
   * 推荐返回自定义协议，例如 lumina-asset://...
   * 返回 null/空字符串表示不处理
   */
  resolve: (src: string) => string | null | undefined;
}

/**
 * 运行时“显示层”修复：
 * - markdown 里保留相对路径
 *
 * 注意：这是 DOM 层面的修复，不修改文档内容/不会影响保存的 markdown。
 */
export const LocalImageResolver = Extension.create<LocalImageResolverOptions>({
  name: 'localImageResolver',

  addOptions() {
    return {
      resolve: () => null,
    };
  },

  addProseMirrorPlugins() {
    const resolve = this.options.resolve;

    return [
      new Plugin({
        view: (view) => {
          const apply = () => {
            const root = view.dom as HTMLElement;
            const imgs = root.querySelectorAll('img');
            imgs.forEach((img) => {
              const el = img as HTMLImageElement;
              const current = el.getAttribute('src') || '';

              // 记录原始 src（用于避免反复覆盖，并保留 markdown 的相对路径信息）
              const original = el.getAttribute('data-original-src') || current;
              if (!original) return;

              // 不处理已经是可用 URL 的情况（避免死循环）
              if (original.startsWith('data:') || original.startsWith('blob:') || /^(https?:)?\/\//.test(original)) {
                return;
              }

              const next = resolve(original);
              if (!next) return;

              if (!el.getAttribute('data-original-src')) {
                el.setAttribute('data-original-src', original);
              }

              // 只在变化时设置，减少重排
              if (el.src !== next) {
                el.src = next;
              }
            });
          };

          // 初次渲染
          queueMicrotask(apply);

          return {
            update: () => apply(),
            destroy: () => {},
          };
        },
      }),
    ];
  },
});

export default LocalImageResolver;



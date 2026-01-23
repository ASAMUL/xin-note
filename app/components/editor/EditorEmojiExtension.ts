import { Emoji as TiptapEmoji, gitHubEmojis } from '@tiptap/extension-emoji'

/**
 * 解决问题：
 * - 重新打开标签页后，markdown 里的 `:older_adult:` 等 emoji shortcode 不会渲染成 emoji。
 *
 * 背景原因（Nuxt UI UEditor / TipTap）：
 * - 当前编辑器使用 `content-type="markdown"`，因此会走 `@tiptap/markdown` 的解析/序列化。
 * - Emoji 扩展本身用于“输入/选择”是 OK 的，但要让 markdown 能往返（shortcode <-> emoji 节点），
 *   必须提供 `markdownTokenizer` + `parseMarkdown` + `renderMarkdown`。
 *
 * 参考：Tiptap Markdown 自定义 tokenizer / parseMarkdown / renderMarkdown。
 */
export const LuminaEmoji = TiptapEmoji.extend({
  /**
   * 把 `:name:` 识别为一个 inline token（例：:older_adult:）
   * - 只允许 a-z0-9_+，与 GitHub emoji shortcode 命名风格对齐
   */
  markdownTokenizer: {
    name: 'emoji',
    level: 'inline',
    start: (src: string) => src.indexOf(':'),
    tokenize: (src: string) => {
      const match = /^:([a-z0-9_+]+):/i.exec(src)
      if (!match) return undefined

      return {
        type: 'emoji',
        raw: match[0],
        emojiName: match[1],
      }
    },
  },

  /**
   * 把 tokenizer 产出的 token 转为 TipTap 节点
   * 注意：emoji 扩展节点的 attrs 使用 `name`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseMarkdown: (token: any) => {
    return {
      type: 'emoji',
      attrs: { name: token.emojiName },
    }
  },

  /**
   * 把 TipTap emoji 节点序列化回 markdown shortcode
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderMarkdown: (node: any) => {
    return `:${node?.attrs?.name || 'unknown'}:`
  },
}).configure({
  // 必须与 UI 菜单使用的 emoji 列表一致，否则会出现“能插入但无法正确渲染/解析”的不一致
  emojis: gitHubEmojis,
})

export default LuminaEmoji


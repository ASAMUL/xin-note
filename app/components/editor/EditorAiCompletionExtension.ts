import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Editor } from '@tiptap/core'

export interface AiCompletionState {
  visible: boolean
  position: number | undefined
  suggestions: string[]
  activeIndex: number
}

export interface AiCompletionOptions {
  /**
   * 触发请求：返回 3 个候选续写（第 1 个用于 ghost，其余用于下拉选择）
   */
  onRequest: (editor: Editor, textBefore: string) => Promise<string[]>
  /**
   * 状态变化回调（用于 Vue 侧渲染下拉按钮等）
   */
  onChange?: (state: AiCompletionState) => void
}

export const aiCompletionPluginKey = new PluginKey('aiCompletion')

export const AiCompletion = Extension.create<AiCompletionOptions, AiCompletionState>({
  name: 'aiCompletion',

  addOptions() {
    return {
      onRequest: async () => [],
      onChange: undefined
    }
  },

  addStorage() {
    // 不直接使用 this.storage，避免某些 TS/ESLint 环境下对 this 类型推断不完整导致报错
    const storage: any = {
      visible: false,
      position: undefined as number | undefined,
      suggestions: [] as string[],
      activeIndex: 0,
      // 用于避免异步请求返回后“复活”过期的 ghost
      requestToken: undefined as string | undefined,
    }

    const notify = () => {
      this.options.onChange?.({
        visible: storage.visible,
        position: storage.position,
        suggestions: storage.suggestions,
        activeIndex: storage.activeIndex
      })
    }

    storage.setSuggestions = (suggestions: string[]) => {
      storage.suggestions = suggestions
      storage.activeIndex = 0
      storage.visible = suggestions.length > 0
      notify()
    }

    storage.setActiveIndex = (index: number) => {
      const max = storage.suggestions.length - 1
      const next = Math.max(0, Math.min(index, max))
      storage.activeIndex = next
      storage.visible = storage.suggestions.length > 0
      notify()
    }

    storage.clear = () => {
      storage.suggestions = []
      storage.activeIndex = 0
      storage.position = undefined
      storage.visible = false
      storage.requestToken = undefined
      notify()
    }

    storage.setPosition = (pos: number) => {
      storage.position = pos
      notify()
    }

    return storage as unknown as AiCompletionState
  },

  addProseMirrorPlugins() {
    const storage = this.storage as unknown as AiCompletionState

    return [
      new Plugin({
        key: aiCompletionPluginKey,
        props: {
          decorations: (state) => {
            if (!storage.visible || !storage.suggestions.length || storage.position === undefined) {
              return DecorationSet.empty
            }

            const suggestion = storage.suggestions[storage.activeIndex] || ''
            if (!suggestion) return DecorationSet.empty

            const widget = Decoration.widget(
              storage.position,
              () => {
                const span = document.createElement('span')
                span.className = 'ai-completion-ghost'
                span.textContent = suggestion
                span.style.cssText =
                  'color: var(--text-mute); opacity: 0.55; pointer-events: none; white-space: pre-wrap;'
                return span
              },
              { side: 1 }
            )

            return DecorationSet.create(state.doc, [widget])
          }
        }
      })
    ]
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const st = this.storage as any
        const suggestion = st.suggestions?.[st.activeIndex] as string | undefined

        // 有 ghost：Tab 直接接受
        if (st.visible && st.position !== undefined && suggestion) {
          const pos = st.position as number
          st.clear?.()

          editor.chain().focus().insertContentAt(pos, suggestion).run()
          return true
        }

        // 没 ghost：Tab 触发请求（生成 3 条候选）
        const { state } = editor
        const { selection } = state
        const pos = selection.from

        // 只在光标处触发（有选区则不触发）
        if (!selection.empty) return false

        // 上下文：取光标前的文本（避免太长就截断）
        const full = state.doc.textBetween(0, pos, '\n')
        const textBefore = full.slice(-2000)

        st.setPosition?.(pos)
        st.clear?.() // 清空旧状态
        const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        st.requestToken = token

        this.options
          .onRequest(editor as unknown as Editor, textBefore)
          .then((suggestions) => {
            // 如果期间被清掉/变更，则忽略这次返回
            if (st.requestToken !== token) return

            const cleaned = (suggestions || [])
              .map(s => (s || '').replace(/\r\n/g, '\n').trimEnd())
              .filter(Boolean)
              .slice(0, 3)

            // 补一个空格前缀：让续写看起来更自然（仅当光标前不是空白且候选不以空白开头）
            const lastChar = full.slice(-1)
            const needsSpace = lastChar && !/\s/.test(lastChar)
            const finalSuggestions = cleaned.map((s) => {
              if (!needsSpace) return s
              return /^\s/.test(s) ? s : ` ${s}`
            })

            st.setSuggestions?.(finalSuggestions)
          })
          .catch((e) => {
            console.error('AI completion 请求失败:', e)
            st.clear?.()
          })

        return true
      },

      Escape: () => {
        const st = this.storage as any
        if (st.visible) {
          st.clear?.()
          return true
        }
        return false
      }
    }
  },

  onUpdate() {
    // 用户输入会改变 doc：清掉 ghost，避免“过期建议”
    const st = this.storage as any
    if (st.visible) {
      st.clear?.()
    }
  },

  onSelectionUpdate() {
    // 光标移动：清掉 ghost，避免错位
    const st = this.storage as any
    if (st.visible) {
      st.clear?.()
    }
  }
})

export default AiCompletion



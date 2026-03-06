/**
 * 自定义代码块扩展
 *
 * 基于 CodeBlockLowlight 扩展，通过 VueNodeViewRenderer
 * 替换默认渲染方式，使用自定义 Vue 组件渲染代码块，
 * 从而支持语言选择下拉和复制按钮。
 */
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import EditorCodeBlockView from './EditorCodeBlockView.vue'

export const LuminaCodeBlock = CodeBlockLowlight.extend({
    addNodeView() {
        return VueNodeViewRenderer(EditorCodeBlockView)
    },
})

export default LuminaCodeBlock

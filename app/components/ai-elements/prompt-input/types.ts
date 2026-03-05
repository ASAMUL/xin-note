import type { FileUIPart } from 'ai'
import type { Ref } from 'vue'

export interface PromptInputReference {
  id: string
  docId: string
  fileName: string
}

export interface PromptInputMessage {
  text: string
  files: FileUIPart[]
  references?: PromptInputReference[]
}

export interface AttachmentFile extends FileUIPart {
  id: string
  file?: File
}

export interface PromptInputContext {
  textInput: Ref<string>
  files: Ref<AttachmentFile[]>
  references: Ref<PromptInputReference[]>
  isLoading: Ref<boolean>
  fileInputRef: Ref<HTMLInputElement | null>
  setTextInput: (val: string) => void
  addFiles: (files: File[] | FileList) => void
  removeFile: (id: string) => void
  addReference: (reference: Omit<PromptInputReference, 'id'> & { id?: string }) => PromptInputReference | null
  removeReference: (id: string) => void
  clearFiles: () => void
  clearReferences: () => void
  clearInput: () => void
  openFileDialog: () => void
  submitForm: () => void
}

export const PROMPT_INPUT_KEY = Symbol('PromptInputContext')

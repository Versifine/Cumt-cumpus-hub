import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
  type ChangeEvent,
} from 'react'
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type JSONContent,
  type NodeViewProps,
} from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'

type UploadResult = {
  url: string
  width?: number
  height?: number
}

export type RichEditorValue = {
  json: JSONContent | null
  text: string
}

export type RichEditorHandle = {
  focus: () => void
  insertText: (text: string) => void
  setContent: (json: JSONContent | null) => void
  flushUploads: () => Promise<{ json: JSONContent | null; failed: boolean }>
}

type RichEditorProps = {
  value: RichEditorValue
  onChange: (value: RichEditorValue) => void
  onImageUpload?: (file: File) => Promise<UploadResult>
  placeholder?: string
  disabled?: boolean
  deferredUpload?: boolean
}

type InlineImageOptions = {
  onRetry?: (uploadId: string) => void
  onRemove?: (uploadId: string) => void
}

const InlineImage = Image.extend<InlineImageOptions>({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: {
        default: null,
      },
      uploading: {
        default: false,
        renderHTML: (attributes) => {
          if (!attributes.uploading) {
            return {}
          }
          return { 'data-uploading': 'true' }
        },
      },
      error: {
        default: false,
        renderHTML: (attributes) => {
          if (!attributes.error) {
            return {}
          }
          return { 'data-error': 'true' }
        },
      },
      width: {
        default: null,
      },
      height: {
        default: null,
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView)
  },
})

const InlineImageView = ({ node, extension, deleteNode }: NodeViewProps) => {
  const uploadId = node.attrs.uploadId as string | null
  const uploading = Boolean(node.attrs.uploading)
  const error = Boolean(node.attrs.error)
  const onRetry = extension.options.onRetry
  const onRemove = extension.options.onRemove

  return (
    <NodeViewWrapper className="rich-editor__image" data-uploading={uploading} data-error={error}>
      <img src={node.attrs.src} alt={node.attrs.alt ?? 'image'} />
      {uploading ? <span className="rich-editor__image-status">上传中...</span> : null}
      {error ? (
        <span className="rich-editor__image-error">
          <button
            type="button"
            onClick={() => {
              if (uploadId && onRetry) {
                onRetry(uploadId)
              }
            }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => {
              if (uploadId && onRemove) {
                onRemove(uploadId)
              } else {
                deleteNode()
              }
            }}
          >
            移除
          </button>
        </span>
      ) : null}
    </NodeViewWrapper>
  )
}

const createUploadId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  ({ value, onChange, onImageUpload, placeholder, disabled, deferredUpload }, ref) => {
    const lastContentRef = useRef<string>('')
    const pendingFiles = useRef(new Map<string, File>())
    const blobUrls = useRef(new Map<string, string>())
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const editorRef = useRef<Editor | null>(null)
    const onImageUploadRef = useRef<typeof onImageUpload>(onImageUpload)
    const onChangeRef = useRef(onChange)
    const disabledRef = useRef(disabled)

    useEffect(() => {
      onImageUploadRef.current = onImageUpload
    }, [onImageUpload])

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    useEffect(() => {
      disabledRef.current = disabled
    }, [disabled])

    const setImageUploading = useCallback((uploadId: string) => {
      const editorInstance = editorRef.current
      if (!editorInstance) {
        return
      }
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image' || node.attrs.uploadId !== uploadId) {
          return
        }
        editorInstance
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              uploading: true,
              error: false,
            })
            return true
          })
          .run()
      })
    }, [])

    const handleUploadResult = useCallback((uploadId: string, result: UploadResult) => {
      const editorInstance = editorRef.current
      if (!editorInstance) {
        return
      }
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image' || node.attrs.uploadId !== uploadId) {
          return
        }
        editorInstance
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              src: result.url,
              width: result.width ?? null,
              height: result.height ?? null,
              uploading: false,
              error: false,
            })
            return true
          })
          .run()
      })
    }, [])

    const setImageError = useCallback((uploadId: string) => {
      const editorInstance = editorRef.current
      if (!editorInstance) {
        return
      }
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image' || node.attrs.uploadId !== uploadId) {
          return
        }
        editorInstance
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              uploading: false,
              error: true,
            })
            return true
          })
          .run()
      })
    }, [])

    const removeImageByUploadId = useCallback((uploadId: string) => {
      const editorInstance = editorRef.current
      if (!editorInstance) {
        return
      }
      editorInstance.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'image' || node.attrs.uploadId !== uploadId) {
          return
        }
        editorInstance
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.delete(pos, pos + node.nodeSize)
            return true
          })
          .run()
      })
      pendingFiles.current.delete(uploadId)
      const blob = blobUrls.current.get(uploadId)
      if (blob) {
        URL.revokeObjectURL(blob)
        blobUrls.current.delete(uploadId)
      }
    }, [])

    const startUpload = useCallback(
      async (uploadId: string, file: File) => {
        setImageUploading(uploadId)
        const uploadFn = onImageUploadRef.current
        if (!uploadFn) {
          setImageError(uploadId)
          return false
        }
        try {
          const result = await uploadFn(file)
          handleUploadResult(uploadId, result)
          pendingFiles.current.delete(uploadId)
          const blob = blobUrls.current.get(uploadId)
          if (blob) {
            URL.revokeObjectURL(blob)
            blobUrls.current.delete(uploadId)
          }
          return true
        } catch {
          setImageError(uploadId)
          return false
        }
      },
      [handleUploadResult, setImageError, setImageUploading],
    )

    const insertImageFile = useCallback(
      (file: File) => {
        const editorInstance = editorRef.current
        if (!editorInstance) {
          return
        }
        const uploadId = createUploadId()
        const blobUrl = URL.createObjectURL(file)
        pendingFiles.current.set(uploadId, file)
        blobUrls.current.set(uploadId, blobUrl)

        const shouldDefer = Boolean(deferredUpload)
        editorInstance
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src: blobUrl,
              alt: file.name,
              uploadId,
              uploading: !shouldDefer,
              error: false,
            },
          })
          .run()

        if (!shouldDefer) {
          void startUpload(uploadId, file)
        }
      },
      [deferredUpload, startUpload],
    )

    const retryUpload = useCallback(
      (uploadId: string) => {
        const file = pendingFiles.current.get(uploadId)
        if (!file) {
          return
        }
        void startUpload(uploadId, file)
      },
      [startUpload],
    )

    const editor = useEditor(
      {
        extensions: [
          Document,
          Paragraph,
          Text,
          StarterKit.configure({
            document: false,
            paragraph: false,
            text: false,
          }),
          Link.configure({
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            HTMLAttributes: {
              rel: 'noopener noreferrer',
              target: '_blank',
            },
          }),
          InlineImage.configure({
            onRetry: retryUpload,
            onRemove: removeImageByUploadId,
          }),
          Placeholder.configure({
            placeholder: placeholder ?? 'Body text (optional)',
          }),
        ],
        content: value.json ?? '',
        editorProps: {
          attributes: {
            class: 'rich-editor__content',
          },
          handlePaste: (_view: EditorView, event: ClipboardEvent) => {
            if (disabledRef.current) {
              return false
            }
            const items = Array.from(event.clipboardData?.items ?? [])
            const files = items
              .filter((item) => item.kind === 'file')
              .map((item) => item.getAsFile())
              .filter((item): item is File => Boolean(item))
              .filter((file) => file.type.startsWith('image/'))

            if (files.length === 0) {
              return false
            }
            files.forEach(insertImageFile)
            return true
          },
          handleDrop: (_view: EditorView, event: DragEvent) => {
            if (disabledRef.current) {
              return false
            }
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
              file.type.startsWith('image/'),
            )
            if (files.length === 0) {
              return false
            }
            files.forEach(insertImageFile)
            return true
          },
        },
        editable: !disabled,
        shouldRerenderOnTransaction: true,
        onUpdate: ({ editor }: { editor: Editor }) => {
          const json = editor.getJSON()
          const text = editor.getText()
          lastContentRef.current = JSON.stringify(json ?? {})
          onChangeRef.current({ json, text })
        },
      },
      [insertImageFile, placeholder, removeImageByUploadId, retryUpload],
    )

    useEffect(() => {
      editorRef.current = editor
    }, [editor])

    useEffect(() => {
      if (!editor) {
        return
      }
      editor.setEditable(!disabled)
    }, [editor, disabled])

    useEffect(() => {
      if (!editor) {
        return
      }
      const serialized = JSON.stringify(value.json ?? {})
      if (serialized === lastContentRef.current) {
        return
      }
      lastContentRef.current = serialized
      editor.commands.setContent(value.json ?? '', false)
    }, [editor, value.json])

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus(),
        insertText: (text: string) => {
          editor?.commands.insertContent(text)
        },
        setContent: (json: JSONContent | null) => {
          editor?.commands.setContent(json ?? '', false)
        },
        flushUploads: async () => {
          const editorInstance = editorRef.current
          if (!editorInstance) {
            return { json: value.json ?? null, failed: false }
          }
          const entries = Array.from(pendingFiles.current.entries())
          if (entries.length === 0) {
            return { json: editorInstance.getJSON(), failed: false }
          }
          const results = await Promise.all(
            entries.map(([uploadId, file]) => startUpload(uploadId, file)),
          )
          const failed = results.some((item) => !item)
          return { json: editorInstance.getJSON(), failed }
        },
      }),
      [editor, startUpload, value.json],
    )

    const handleSetLink = () => {
      if (!editor) {
        return
      }
      const previous = editor.getAttributes('link').href as string | undefined
      const url = window.prompt('Link URL', previous ?? '')
      if (url === null) {
        return
      }
      if (url.trim() === '') {
        editor.chain().focus().unsetLink().run()
        return
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
    }

    const handleImageButton = () => {
      if (disabledRef.current || !onImageUploadRef.current) {
        return
      }
      fileInputRef.current?.click()
    }

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (disabledRef.current || !onImageUploadRef.current) {
        event.target.value = ''
        return
      }
      const files = Array.from(event.target.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      event.target.value = ''
      files.forEach(insertImageFile)
    }

    const handleToolMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
    }

    const can = editor?.can()

    const toolbarButtons = [
      {
        label: 'B',
        title: 'Bold',
        action: () => editor?.chain().focus().toggleBold().run(),
        active: Boolean(editor?.isActive('bold')),
        disabled: Boolean(disabled || !can?.toggleBold()),
      },
      {
        label: 'I',
        title: 'Italic',
        action: () => editor?.chain().focus().toggleItalic().run(),
        active: Boolean(editor?.isActive('italic')),
        disabled: Boolean(disabled || !can?.toggleItalic()),
      },
      {
        label: 'S',
        title: 'Strike',
        action: () => editor?.chain().focus().toggleStrike().run(),
        active: Boolean(editor?.isActive('strike')),
        disabled: Boolean(disabled || !can?.toggleStrike()),
      },
      {
        label: 'H2',
        title: 'Heading 2',
        action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        active: Boolean(editor?.isActive('heading', { level: 2 })),
        disabled: Boolean(disabled || !can?.toggleHeading({ level: 2 })),
      },
      {
        label: 'H3',
        title: 'Heading 3',
        action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
        active: Boolean(editor?.isActive('heading', { level: 3 })),
        disabled: Boolean(disabled || !can?.toggleHeading({ level: 3 })),
      },
      {
        label: 'Quote',
        title: 'Blockquote',
        action: () => editor?.chain().focus().toggleBlockquote().run(),
        active: Boolean(editor?.isActive('blockquote')),
        disabled: Boolean(disabled || !can?.toggleBlockquote()),
      },
      {
        label: 'UL',
        title: 'Bullet List',
        action: () => editor?.chain().focus().toggleBulletList().run(),
        active: Boolean(editor?.isActive('bulletList')),
        disabled: Boolean(disabled || !can?.toggleBulletList()),
      },
      {
        label: 'OL',
        title: 'Ordered List',
        action: () => editor?.chain().focus().toggleOrderedList().run(),
        active: Boolean(editor?.isActive('orderedList')),
        disabled: Boolean(disabled || !can?.toggleOrderedList()),
      },
      {
        label: '</>',
        title: 'Inline Code',
        action: () => editor?.chain().focus().toggleCode().run(),
        active: Boolean(editor?.isActive('code')),
        disabled: Boolean(disabled || !can?.toggleCode()),
      },
      {
        label: '{ }',
        title: 'Code Block',
        action: () => editor?.chain().focus().toggleCodeBlock().run(),
        active: Boolean(editor?.isActive('codeBlock')),
        disabled: Boolean(disabled || !can?.toggleCodeBlock()),
      },
    ]

    return (
      <div className={`rich-editor ${disabled ? 'is-disabled' : ''}`}>
        <div className="rich-editor__toolbar">
          <div className="rich-editor__toolbar-group">
            {toolbarButtons.slice(0, 3).map((button) => (
              <button
                key={button.title}
                type="button"
                className={
                  button.active ? 'rich-editor__tool is-active' : 'rich-editor__tool'
                }
                onMouseDown={handleToolMouseDown}
                onClick={button.action}
                title={button.title}
                disabled={button.disabled}
                aria-pressed={button.active}
              >
                <span className="rich-editor__tool-label">{button.label}</span>
              </button>
            ))}
          </div>
          <div className="rich-editor__toolbar-group">
            {toolbarButtons.slice(3, 6).map((button) => (
              <button
                key={button.title}
                type="button"
                className={
                  button.active ? 'rich-editor__tool is-active' : 'rich-editor__tool'
                }
                onMouseDown={handleToolMouseDown}
                onClick={button.action}
                title={button.title}
                disabled={button.disabled}
                aria-pressed={button.active}
              >
                <span className="rich-editor__tool-label">{button.label}</span>
              </button>
            ))}
          </div>
          <div className="rich-editor__toolbar-group">
            {toolbarButtons.slice(6, 8).map((button) => (
              <button
                key={button.title}
                type="button"
                className={
                  button.active ? 'rich-editor__tool is-active' : 'rich-editor__tool'
                }
                onMouseDown={handleToolMouseDown}
                onClick={button.action}
                title={button.title}
                disabled={button.disabled}
                aria-pressed={button.active}
              >
                <span className="rich-editor__tool-label">{button.label}</span>
              </button>
            ))}
          </div>
          <div className="rich-editor__toolbar-group">
            {toolbarButtons.slice(8).map((button) => (
              <button
                key={button.title}
                type="button"
                className={
                  button.active ? 'rich-editor__tool is-active' : 'rich-editor__tool'
                }
                onMouseDown={handleToolMouseDown}
                onClick={button.action}
                title={button.title}
                disabled={button.disabled}
                aria-pressed={button.active}
              >
                <span className="rich-editor__tool-label">{button.label}</span>
              </button>
            ))}
          </div>
          <div className="rich-editor__toolbar-group">
            <button
              type="button"
              className={
                editor?.isActive('link') ? 'rich-editor__tool is-active' : 'rich-editor__tool'
              }
              onMouseDown={handleToolMouseDown}
              onClick={handleSetLink}
              title="Insert link"
              disabled={disabled}
              aria-pressed={editor?.isActive('link') ?? false}
            >
              <span className="rich-editor__tool-label">Link</span>
            </button>
            <button
              type="button"
              className="rich-editor__tool rich-editor__tool--wide"
              onMouseDown={handleToolMouseDown}
              onClick={handleImageButton}
              title="Insert image"
              disabled={disabled || !onImageUploadRef.current}
            >
              <span className="rich-editor__tool-label">Image</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            className="rich-editor__file"
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            disabled={disabled}
          />
        </div>
        <div className="rich-editor__body">
          <EditorContent editor={editor} />
        </div>
      </div>
    )
  },
)

RichEditor.displayName = 'RichEditor'

export default RichEditor

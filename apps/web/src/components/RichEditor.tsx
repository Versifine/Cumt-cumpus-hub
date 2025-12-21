import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
}

type RichEditorProps = {
  value: RichEditorValue
  onChange: (value: RichEditorValue) => void
  onImageUpload?: (file: File) => Promise<UploadResult>
  placeholder?: string
  disabled?: boolean
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
  ({ value, onChange, onImageUpload, placeholder, disabled }, ref) => {
    const lastContentRef = useRef<string>('')
    const pendingFiles = useRef(new Map<string, File>())
    const blobUrls = useRef(new Map<string, string>())
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const editorRef = useRef<Editor | null>(null)

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
        if (!onImageUpload) {
          setImageError(uploadId)
          return
        }
        try {
          const result = await onImageUpload(file)
          handleUploadResult(uploadId, result)
          pendingFiles.current.delete(uploadId)
          const blob = blobUrls.current.get(uploadId)
          if (blob) {
            URL.revokeObjectURL(blob)
            blobUrls.current.delete(uploadId)
          }
        } catch {
          setImageError(uploadId)
        }
      },
      [handleUploadResult, onImageUpload, setImageError, setImageUploading],
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

        editorInstance
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src: blobUrl,
              alt: file.name,
              uploadId,
              uploading: true,
              error: false,
            },
          })
          .run()

        void startUpload(uploadId, file)
      },
      [startUpload],
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
        onUpdate: ({ editor }: { editor: Editor }) => {
          const json = editor.getJSON()
          const text = editor.getText()
          onChange({ json, text })
        },
      },
      [disabled, insertImageFile, onChange, placeholder, removeImageByUploadId, retryUpload],
    )

    useEffect(() => {
      editorRef.current = editor
    }, [editor])

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
      }),
      [editor],
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
      fileInputRef.current?.click()
    }

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      event.target.value = ''
      files.forEach(insertImageFile)
    }

    const toolbarButtons = useMemo(
      () => [
        {
          label: 'B',
          title: 'Bold',
          action: () => editor?.chain().focus().toggleBold().run(),
          active: editor?.isActive('bold'),
        },
        {
          label: 'I',
          title: 'Italic',
          action: () => editor?.chain().focus().toggleItalic().run(),
          active: editor?.isActive('italic'),
        },
        {
          label: 'S',
          title: 'Strike',
          action: () => editor?.chain().focus().toggleStrike().run(),
          active: editor?.isActive('strike'),
        },
        {
          label: 'H2',
          title: 'Heading 2',
          action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          active: editor?.isActive('heading', { level: 2 }),
        },
        {
          label: 'H3',
          title: 'Heading 3',
          action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
          active: editor?.isActive('heading', { level: 3 }),
        },
        {
          label: 'Quote',
          title: 'Blockquote',
          action: () => editor?.chain().focus().toggleBlockquote().run(),
          active: editor?.isActive('blockquote'),
        },
        {
          label: 'UL',
          title: 'Bullet List',
          action: () => editor?.chain().focus().toggleBulletList().run(),
          active: editor?.isActive('bulletList'),
        },
        {
          label: 'OL',
          title: 'Ordered List',
          action: () => editor?.chain().focus().toggleOrderedList().run(),
          active: editor?.isActive('orderedList'),
        },
        {
          label: '</>',
          title: 'Inline Code',
          action: () => editor?.chain().focus().toggleCode().run(),
          active: editor?.isActive('code'),
        },
        {
          label: '{ }',
          title: 'Code Block',
          action: () => editor?.chain().focus().toggleCodeBlock().run(),
          active: editor?.isActive('codeBlock'),
        },
      ],
      [editor],
    )

    return (
      <div className={`rich-editor ${disabled ? 'is-disabled' : ''}`}>
        <div className="rich-editor__toolbar">
          {toolbarButtons.map((button) => (
            <button
              key={button.title}
              type="button"
              className={
                button.active ? 'rich-editor__tool is-active' : 'rich-editor__tool'
              }
              onClick={button.action}
              title={button.title}
              disabled={disabled}
            >
              {button.label}
            </button>
          ))}
          <button
            type="button"
            className={editor?.isActive('link') ? 'rich-editor__tool is-active' : 'rich-editor__tool'}
            onClick={handleSetLink}
            title="Insert link"
            disabled={disabled}
          >
            Link
          </button>
          <button
            type="button"
            className="rich-editor__tool"
            onClick={handleImageButton}
            title="Insert image"
            disabled={disabled}
          >
            Image
          </button>
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

import { useCallback, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { extractMediaFromContent } from '../utils/media'
import MediaViewer from './MediaViewer'

type RichContentProps = {
  contentJson?: unknown
  contentText?: string
}

const parseContent = (value: unknown) => {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

const RichContent = ({ contentJson, contentText }: RichContentProps) => {
  const content = useMemo(() => {
    const parsed = parseContent(contentJson)
    if (parsed) {
      return parsed
    }
    return contentText ?? ''
  }, [contentJson, contentText])

  const mediaItems = useMemo(
    () => extractMediaFromContent(contentJson),
    [contentJson],
  )
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  const handleOpen = useCallback(
    (src: string) => {
      const index = mediaItems.findIndex((item) => item.url === src)
      if (index < 0) {
        return false
      }
      setViewerIndex(index)
      setViewerOpen(true)
      return true
    },
    [mediaItems],
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
          openOnClick: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        }),
        Image.configure({
          HTMLAttributes: {
            class: 'rich-content__image',
          },
        }),
      ],
      content,
      editable: false,
      editorProps: {
        handleClickOn: (
          _view: EditorView,
          _pos: number,
          node: ProseMirrorNode,
          _nodePos: number,
          event: MouseEvent,
        ) => {
          if (node.type.name !== 'image') {
            return false
          }
          const src = node.attrs?.src as string | undefined
          if (!src) {
            return false
          }
          const handled = handleOpen(src)
          if (handled) {
            event.preventDefault()
            event.stopPropagation()
          }
          return handled
        },
      },
    },
    [content, handleOpen],
  )

  if (!editor) {
    return null
  }

  return (
    <div className="rich-content">
      <EditorContent editor={editor} />
      <MediaViewer
        items={mediaItems}
        open={viewerOpen}
        startIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}

export default RichContent

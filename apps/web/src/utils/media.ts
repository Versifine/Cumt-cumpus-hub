export type MediaKind = 'image' | 'video'

export type MediaItem = {
  url: string
  type: MediaKind
  width?: number
  height?: number
  alt?: string
}

type AttachmentLike = {
  url: string
  filename?: string
  type?: string
}

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const videoExtensions = new Set(['mp4', 'webm', 'ogg'])

const getFileExtension = (value: string) => {
  const parts = value.split('.')
  if (parts.length < 2) {
    return ''
  }
  return parts[parts.length - 1].toLowerCase()
}

const inferMediaKind = (value: AttachmentLike): MediaKind => {
  if (value.type) {
    if (value.type.startsWith('image/')) {
      return 'image'
    }
    if (value.type.startsWith('video/')) {
      return 'video'
    }
  }

  const filename = value.filename ?? value.url
  const ext = getFileExtension(filename)
  if (imageExtensions.has(ext)) {
    return 'image'
  }
  if (videoExtensions.has(ext)) {
    return 'video'
  }
  return 'image'
}

const normalizeFromAttachments = (attachments: AttachmentLike[] | undefined) => {
  if (!attachments || attachments.length === 0) {
    return []
  }
  return attachments.map((item) => ({
    url: item.url,
    type: inferMediaKind(item),
    alt: item.filename ?? 'media',
  }))
}

const parseContentJSON = (value: unknown) => {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return value
    }
  }
  return value
}

const extractMediaFromDelta = (doc: unknown): MediaItem[] => {
  if (!doc || typeof doc !== 'object') {
    return []
  }
  const record = doc as { ops?: unknown }
  if (!Array.isArray(record.ops)) {
    return []
  }
  const items: MediaItem[] = []
  record.ops.forEach((op) => {
    if (!op || typeof op !== 'object') {
      return
    }
    const insert = (op as { insert?: unknown }).insert
    if (!insert || typeof insert !== 'object') {
      return
    }
    const insertRecord = insert as { image?: string; video?: string }
    if (insertRecord.image) {
      items.push({ url: insertRecord.image, type: 'image' })
    }
    if (insertRecord.video) {
      items.push({ url: insertRecord.video, type: 'video' })
    }
  })
  return items
}

const extractMediaFromJSON = (doc: unknown): MediaItem[] => {
  if (!doc || typeof doc !== 'object') {
    return []
  }
  const items: MediaItem[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') {
      return
    }
    if (node.type === 'image' && node.attrs?.src) {
      items.push({
        url: node.attrs.src as string,
        type: 'image',
        alt: node.attrs.alt as string | undefined,
        width: node.attrs.width as number | undefined,
        height: node.attrs.height as number | undefined,
      })
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(visit)
    }
  }
  visit(doc)
  return items
}

const extractMediaFromHTML = (html: string) => {
  const items: MediaItem[] = []
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/gi
  let match = imgPattern.exec(html)
  while (match) {
    const url = match[1]
    if (url) {
      items.push({ url, type: 'image' })
    }
    match = imgPattern.exec(html)
  }
  const videoPattern = /<video[^>]+src=["']([^"']+)["']/gi
  match = videoPattern.exec(html)
  while (match) {
    const url = match[1]
    if (url) {
      items.push({ url, type: 'video' })
    }
    match = videoPattern.exec(html)
  }
  return items
}

const extractMediaFromMarkdown = (markdown: string | null | undefined) => {
  if (!markdown) {
    return []
  }
  const pattern = /!\[[^\]]*]\(([^)]+)\)/g
  const items: MediaItem[] = []
  let match = pattern.exec(markdown)
  while (match) {
    const url = match[1]
    if (url) {
      items.push({ url, type: 'image' })
    }
    match = pattern.exec(markdown)
  }
  return items
}

const extractInlineMedia = (comment: {
  content_md?: string | null
  content_json?: unknown
}) => {
  const jsonDoc = parseContentJSON(comment.content_json)
  if (typeof jsonDoc === 'string') {
    const htmlItems = extractMediaFromHTML(jsonDoc)
    if (htmlItems.length > 0) {
      return htmlItems
    }
    return extractMediaFromMarkdown(jsonDoc)
  }
  if (jsonDoc) {
    const deltaItems = extractMediaFromDelta(jsonDoc)
    if (deltaItems.length > 0) {
      return deltaItems
    }
    return extractMediaFromJSON(jsonDoc)
  }
  return extractMediaFromMarkdown(comment.content_md)
}

export const normalizeCommentMedia = (comment: {
  attachments?: AttachmentLike[]
  content_md?: string | null
  content_json?: unknown
}) => {
  const candidates = [
    ...normalizeFromAttachments(comment.attachments),
    ...extractInlineMedia(comment),
  ]
  const seen = new Set<string>()
  const out: MediaItem[] = []
  for (const item of candidates) {
    if (!item.url || seen.has(item.url)) {
      continue
    }
    seen.add(item.url)
    out.push(item)
  }
  return out
}

export const normalizeMediaFromAttachments = (
  attachments: AttachmentLike[] | undefined,
) => {
  return normalizeCommentMedia({ attachments })
}

export const extractMediaFromContent = (contentJson: unknown) => {
  const jsonDoc = parseContentJSON(contentJson)
  if (!jsonDoc) {
    return [] as MediaItem[]
  }
  if (typeof jsonDoc === 'string') {
    const htmlItems = extractMediaFromHTML(jsonDoc)
    if (htmlItems.length > 0) {
      return htmlItems
    }
    return extractMediaFromMarkdown(jsonDoc)
  }
  const deltaItems = extractMediaFromDelta(jsonDoc)
  if (deltaItems.length > 0) {
    return deltaItems
  }
  return extractMediaFromJSON(jsonDoc)
}

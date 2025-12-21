import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '../api/client'
import { uploadInlineImage } from '../api/uploads'
import {
  createComment,
  clearCommentVote,
  clearVote,
  deleteComment,
  deletePost,
  fetchComments,
  fetchPostDetail,
  votePost,
  voteComment,
  type CommentItem,
  type PostDetail,
} from '../api/posts'
import CommentMediaBlock from '../components/CommentMediaBlock'
import RichContent from '../components/RichContent'
import RichEditor, { type RichEditorHandle, type RichEditorValue } from '../components/RichEditor'
import SiteHeader from '../components/SiteHeader'
import { ErrorState } from '../components/StateBlocks'
import TagInput from '../components/TagInput'
import InlineAvatar from '../components/InlineAvatar'
import { useAuth } from '../context/AuthContext'
import { extractMediaFromContent, normalizeMediaFromAttachments } from '../utils/media'
import { clearDraft, loadDraft, saveDraft } from '../utils/drafts'
import { formatRelativeTimeUTC8 } from '../utils/time'

type LoadState<T> = {
  data: T
  loading: boolean
  error: string | null
}

type VoteState = -1 | 0 | 1
type VoteAction = 1 | -1

const normalizeVote = (value: number | undefined): VoteState => {
  if (value === 1) {
    return 1
  }
  if (value === -1) {
    return -1
  }
  return 0
}

const maxInlineImageSize = 100 * 1024 * 1024

const isSupportedImage = (file: File) => file.type.startsWith('image/')

type ThreadedComment = CommentItem & {
  children: ThreadedComment[]
}

const getParentId = (comment: CommentItem) => {
  const parentId = comment.parent_id
  if (!parentId || typeof parentId !== 'string') {
    return null
  }
  const trimmed = parentId.trim()
  if (!trimmed || trimmed === comment.id) {
    return null
  }
  return trimmed
}

const buildCommentTree = (comments: CommentItem[]) => {
  const nodes = new Map<string, ThreadedComment>()
  comments.forEach((comment) => {
    nodes.set(comment.id, { ...comment, children: [] })
  })

  const roots: ThreadedComment[] = []
  comments.forEach((comment) => {
    const node = nodes.get(comment.id)
    if (!node) {
      return
    }
    const parentId = getParentId(comment)
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

const getAuthorAvatar = (author: CommentItem['author']) => {
  const record = author as { avatar_url?: string | null }
  return record.avatar_url ?? null
}

const commentDraftKey = (postId: string) => `draft:comment:${postId}`

const PostPlaceholder = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const commentEditorRef = useRef<RichEditorHandle | null>(null)
  const [state, setState] = useState<LoadState<PostDetail | null>>({
    data: null,
    loading: true,
    error: null,
  })
  const [commentsState, setCommentsState] = useState<LoadState<CommentItem[]>>({
    data: [],
    loading: true,
    error: null,
  })
  const [commentDraft, setCommentDraft] = useState<RichEditorValue>({
    json: null,
    text: '',
  })
  const [commentTags, setCommentTags] = useState<string[]>([])
  const [commentDraftHint, setCommentDraftHint] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; nickname: string } | null>(
    null,
  )
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentDeleting, setCommentDeleting] = useState<string | null>(null)
  const [postDeleting, setPostDeleting] = useState(false)
  const [postVote, setPostVote] = useState<VoteState>(0)
  const [postScore, setPostScore] = useState(0)
  const [postVotePending, setPostVotePending] = useState(false)
  const [postShareLabel, setPostShareLabel] = useState('分享')
  const [postHint, setPostHint] = useState<string | null>(null)
  const [commentVotes, setCommentVotes] = useState<Record<string, VoteState>>({})
  const [commentScores, setCommentScores] = useState<Record<string, number>>({})
  const [commentVotePending, setCommentVotePending] = useState<Record<string, boolean>>({})
  const [commentShareLabels, setCommentShareLabels] = useState<Record<string, string>>(
    {},
  )
  const threadedComments = useMemo(
    () => buildCommentTree(commentsState.data),
    [commentsState.data],
  )
  const postInlineMedia = useMemo(() => {
    if (!state.data) {
      return []
    }
    return extractMediaFromContent(state.data.content_json)
  }, [state.data?.content_json])
  const postAttachmentMedia = useMemo(() => {
    if (!state.data) {
      return []
    }
    return normalizeMediaFromAttachments(state.data.attachments)
  }, [state.data?.attachments])
  const postExtraMedia = useMemo(() => {
    if (postInlineMedia.length === 0) {
      return postAttachmentMedia
    }
    const inlineUrls = new Set(postInlineMedia.map((item) => item.url))
    return postAttachmentMedia.filter((item) => !inlineUrls.has(item.url))
  }, [postAttachmentMedia, postInlineMedia])
  const canSubmitComment = useMemo(() => {
    const mediaItems = extractMediaFromContent(commentDraft.json)
    return commentDraft.text.trim() !== '' || mediaItems.length > 0
  }, [commentDraft])

  const loadPost = useCallback(async () => {
    if (!id) {
      setState({ data: null, loading: false, error: '无效的帖子ID' })
      return
    }

    setState({ data: null, loading: true, error: null })

    try {
      const data = await fetchPostDetail(id)
      setPostVote(normalizeVote(data.my_vote))
      setPostScore(typeof data.score === 'number' ? data.score : 0)
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({ data: null, loading: false, error: getErrorMessage(error) })
    }
  }, [id])

  const loadComments = useCallback(async () => {
    if (!id) {
      setCommentsState({ data: [], loading: false, error: '无效的帖子ID' })
      return
    }

    setCommentsState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const data = await fetchComments(id)
      const voteMap: Record<string, VoteState> = {}
      const scoreMap: Record<string, number> = {}

      data.forEach((comment) => {
        voteMap[comment.id] = normalizeVote(comment.my_vote)
        scoreMap[comment.id] = typeof comment.score === 'number' ? comment.score : 0
      })

      setCommentVotes(voteMap)
      setCommentScores(scoreMap)
      setCommentVotePending({})
      setCommentsState({ data, loading: false, error: null })
    } catch (error) {
      setCommentsState({
        data: [],
        loading: false,
        error: getErrorMessage(error),
      })
    }
  }, [id])

  useEffect(() => {
    void loadPost()
    void loadComments()
  }, [loadComments, loadPost])

  useEffect(() => {
    if (!id) {
      return
    }
    const draft = loadDraft<{
      content: RichEditorValue
      tags: string[]
    }>(commentDraftKey(id))
    if (!draft) {
      return
    }
    setCommentDraft(draft.data.content)
    setCommentTags(draft.data.tags)
  }, [id])

  useEffect(() => {
    if (!id) {
      return
    }
    const hasDraft =
      commentDraft.text.trim() !== '' ||
      Boolean(commentDraft.json) ||
      commentTags.length > 0
    if (!hasDraft) {
      clearDraft(commentDraftKey(id))
      return
    }
    const timer = window.setTimeout(() => {
      saveDraft(commentDraftKey(id), {
        content: commentDraft,
        tags: commentTags,
      })
      setCommentDraftHint('草稿已保存')
      window.setTimeout(() => setCommentDraftHint(null), 1200)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [commentDraft, commentTags, id])

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  const handleAuthorProfile = () => {
    const authorId = state.data?.author.id
    if (authorId) {
      navigate(`/u/${authorId}`)
    }
  }

  const handleCommentAuthorProfile = (authorId: string) => {
    if (authorId) {
      navigate(`/u/${authorId}`)
    }
  }

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCommentError(null)

    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }

    if (!user) {
      navigate('/login', { state: { from: `/post/${id}` } })
      return
    }

    const mediaItems = extractMediaFromContent(commentDraft.json)
    if (!commentDraft.text.trim() && mediaItems.length === 0) {
      setCommentError('请输入评论内容或插入图片')
      return
    }

    setCommentSubmitting(true)

    try {
      const uploadResult = await commentEditorRef.current?.flushUploads()
      if (uploadResult?.failed) {
        setCommentError('图片上传失败，请重试')
        return
      }
      const resolvedJson = uploadResult?.json ?? commentDraft.json
      await createComment(id, {
        content: commentDraft.text.trim(),
        content_json: resolvedJson ?? undefined,
        tags: commentTags,
        parent_id: replyTarget?.id ?? null,
      })
      setCommentDraft({ json: null, text: '' })
      setCommentTags([])
      setReplyTarget(null)
      clearDraft(commentDraftKey(id))
      commentEditorRef.current?.setContent(null)
      await loadComments()
    } catch (error) {
      setCommentError(getErrorMessage(error))
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }
    if (!user) {
      navigate('/login', { state: { from: `/post/${id}` } })
      return
    }
    if (!window.confirm('确定要删除这条评论吗？')) {
      return
    }

    setCommentDeleting(commentId)
    setCommentError(null)

    try {
      await deleteComment(id, commentId)
      await loadComments()
    } catch (error) {
      setCommentError(getErrorMessage(error))
    } finally {
      setCommentDeleting(null)
    }
  }

  const handleDeletePost = async () => {
    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }
    if (!user) {
      navigate('/login', { state: { from: `/post/${id}` } })
      return
    }
    if (!window.confirm('确定要删除这条帖子吗？')) {
      return
    }

    setPostDeleting(true)
    setCommentError(null)

    try {
      await deletePost(id)
      handleBack()
    } catch (error) {
      setCommentError(getErrorMessage(error))
    } finally {
      setPostDeleting(false)
    }
  }

  const handlePostVote = async (nextVote: VoteAction) => {
    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }
    if (!user) {
      navigate('/login', { state: { from: `/post/${id}` } })
      return
    }
    if (postVotePending) {
      return
    }

    setPostHint(null)
    setPostVotePending(true)

    try {
      const response =
        postVote === nextVote ? await clearVote(id) : await votePost(id, nextVote)
      setPostVote(normalizeVote(response.my_vote))
      setPostScore(response.score)
    } catch (error) {
      setPostHint(getErrorMessage(error))
    } finally {
      setPostVotePending(false)
    }
  }

  const handleFocusComment = () => {
    commentEditorRef.current?.focus()
  }

  const handlePostShare = async () => {
    if (!id) {
      return
    }
    const url = new URL(`/post/${id}`, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      setPostShareLabel('已复制')
    } catch {
      setPostShareLabel('复制失败')
    } finally {
      window.setTimeout(() => setPostShareLabel('分享'), 1500)
    }
  }

  const handleReply = (commentId: string, nickname: string) => {
    const mention = `@${nickname} `
    setReplyTarget({ id: commentId, nickname })
    commentEditorRef.current?.insertText(mention)
    commentEditorRef.current?.focus()
  }

  const handleCommentVote = async (commentId: string, nextVote: VoteAction) => {
    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }
    if (!user) {
      navigate('/login', { state: { from: `/post/${id}` } })
      return
    }
    if (commentVotePending[commentId]) {
      return
    }

    setCommentError(null)
    setCommentVotePending((prev) => ({ ...prev, [commentId]: true }))

    try {
      const current = commentVotes[commentId] ?? 0
      const response =
        current === nextVote
          ? await clearCommentVote(id, commentId)
          : await voteComment(id, commentId, nextVote)
      setCommentVotes((prev) => ({
        ...prev,
        [commentId]: normalizeVote(response.my_vote),
      }))
      setCommentScores((prev) => ({
        ...prev,
        [commentId]: response.score,
      }))
    } catch (error) {
      setCommentError(getErrorMessage(error))
    } finally {
      setCommentVotePending((prev) => ({ ...prev, [commentId]: false }))
    }
  }

  const handleCommentShare = async (commentId: string) => {
    if (!id) {
      return
    }
    const url = new URL(`/post/${id}`, window.location.origin)
    url.hash = `comment-${commentId}`

    try {
      await navigator.clipboard.writeText(url.toString())
      setCommentShareLabels((prev) => ({ ...prev, [commentId]: '已复制' }))
    } catch {
      setCommentShareLabels((prev) => ({ ...prev, [commentId]: '复制失败' }))
    } finally {
      window.setTimeout(() => {
        setCommentShareLabels((prev) => ({ ...prev, [commentId]: '分享' }))
      }, 1500)
    }
  }

  const handleInlineImageUpload = async (file: File) => {
    if (!user) {
      setCommentError('请先登录后上传图片')
      throw new Error('unauthorized')
    }
    if (!isSupportedImage(file)) {
      setCommentError('仅支持图片文件')
      throw new Error('unsupported image')
    }
    if (file.size > maxInlineImageSize) {
      setCommentError('图片不能超过 100MB')
      throw new Error('image too large')
    }
    return uploadInlineImage(file)
  }

  const handleSaveCommentDraft = () => {
    if (!id) {
      return
    }
    saveDraft(commentDraftKey(id), {
      content: commentDraft,
      tags: commentTags,
    })
    setCommentDraftHint('草稿已保存')
    window.setTimeout(() => setCommentDraftHint(null), 1200)
  }

  const renderComment = (comment: ThreadedComment, depth: number) => {
    const inlineMedia = extractMediaFromContent(comment.content_json)
    const attachmentMedia = normalizeMediaFromAttachments(comment.attachments)
    const inlineUrls = new Set(inlineMedia.map((item) => item.url))
    const extraMedia = attachmentMedia.filter((item) => !inlineUrls.has(item.url))
    const commentMedia = inlineMedia.length > 0 ? extraMedia : attachmentMedia
    const vote = commentVotes[comment.id] ?? 0
    const score = commentScores[comment.id] ?? 0
    const shareLabel = commentShareLabels[comment.id] ?? '分享'
    const canDelete = Boolean(user && comment.author.id === user.id)
    const indentLevel = Math.min(depth, 4)
    const authorAvatar = getAuthorAvatar(comment.author)
    const threadStyle = {
      '--comment-indent': `${indentLevel * 16}px`,
    } as CSSProperties

    return (
      <div
        key={comment.id}
        className={depth > 0 ? 'comment-thread comment-thread--nested' : 'comment-thread'}
        style={threadStyle}
      >
        <div id={`comment-${comment.id}`} className="comment-item">
          <div className="comment-header">
            <div className="comment-meta">
              <button
                type="button"
                className="comment-author"
                onClick={() => handleCommentAuthorProfile(comment.author.id)}
              >
                <InlineAvatar name={comment.author.nickname} src={authorAvatar} size={26} />
                <span>{comment.author.nickname}</span>
              </button>
              <span className="comment-meta__dot">·</span>
              <span>{formatRelativeTimeUTC8(comment.created_at)}</span>
            </div>
            <details className="action-menu">
              <summary className="action-menu__trigger" aria-label="更多操作">
                ...
              </summary>
              <div className="action-menu__panel" role="menu">
                {canDelete ? (
                  <button
                    type="button"
                    className="action-menu__item"
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={commentDeleting === comment.id}
                  >
                    {commentDeleting === comment.id ? '删除中...' : '删除'}
                  </button>
                ) : (
                  <span className="action-menu__empty">暂无操作</span>
                )}
              </div>
            </details>
          </div>
          <RichContent
            contentJson={comment.content_json}
            contentText={comment.content}
          />
          <CommentMediaBlock media={commentMedia} variant="comment" />
          <div className="comment-actions">
            <div className="comment-vote-group" aria-label="点赞与点踩">
              <button
                type="button"
                className={vote === 1 ? 'comment-vote-btn is-active' : 'comment-vote-btn'}
                onClick={() => handleCommentVote(comment.id, 1)}
                aria-pressed={vote === 1}
                disabled={commentVotePending[comment.id]}
              >
                赞
              </button>
              <span className="comment-vote-score" aria-label={`分值 ${score}`}>
                {score}
              </span>
              <button
                type="button"
                className={vote === -1 ? 'comment-vote-btn is-active' : 'comment-vote-btn'}
                onClick={() => handleCommentVote(comment.id, -1)}
                aria-pressed={vote === -1}
                disabled={commentVotePending[comment.id]}
              >
                踩
              </button>
            </div>
            <button
              type="button"
              className="comment-action"
              onClick={() => handleReply(comment.id, comment.author.nickname)}
            >
              评论
            </button>
            <button
              type="button"
              className="comment-action"
              onClick={() => handleCommentShare(comment.id)}
            >
              {shareLabel}
            </button>
          </div>
        </div>
        {comment.children.length > 0 ? (
          <div className="comment-thread__children">
            {comment.children.map((child) => renderComment(child, depth + 1))}
          </div>
        ) : null}
      </div>
    )
  }

  const renderPostMenuItem = () => {
    const canDelete = Boolean(user && state.data && state.data.author.id === user.id)
    if (!canDelete) {
      return null
    }
    return (
      <button
        type="button"
        className="action-menu__item"
        onClick={handleDeletePost}
        disabled={postDeleting}
      >
        {postDeleting ? '删除中...' : '删除'}
      </button>
    )
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="post-placeholder">
        <div className="post-placeholder__card">
          <button type="button" className="back-link" onClick={handleBack}>
            ← 返回
          </button>
          {state.loading ? (
            <div className="page-status">正在加载帖子...</div>
          ) : state.error ? (
            <ErrorState message={state.error} onRetry={loadPost} />
          ) : state.data ? (
            <>
              <div className="post-detail__header">
                <div className="post-placeholder__title">{state.data.title}</div>
                <details className="action-menu">
                  <summary className="action-menu__trigger" aria-label="更多操作">
                    ...
                  </summary>
                  <div className="action-menu__panel" role="menu">
                    {renderPostMenuItem() ?? (
                      <span className="action-menu__empty">暂无操作</span>
                    )}
                  </div>
                </details>
              </div>
              <div className="post-detail__meta">
                <button
                  type="button"
                  className="post-meta__author"
                  onClick={handleAuthorProfile}
                >
                  <InlineAvatar
                    name={state.data.author.nickname}
                    src={getAuthorAvatar(state.data.author)}
                    size={28}
                  />
                  <span>{state.data.author.nickname}</span>
                </button>
                <span className="post-meta__dot">·</span>
                <span>{formatRelativeTimeUTC8(state.data.created_at)}</span>
                {state.data.board?.name ? (
                  <>
                    <span className="post-meta__dot">·</span>
                    <span>{state.data.board.name}</span>
                  </>
                ) : null}
              </div>
              <RichContent
                contentJson={state.data.content_json}
                contentText={state.data.content}
              />
              {postExtraMedia.length > 0 ? (
                <CommentMediaBlock media={postExtraMedia} variant="post" />
              ) : null}
              <div className="post-card__actions">
                <div className="post-card__vote-group" aria-label="点赞与点踩">
                  <button
                    type="button"
                    className={
                      postVote === 1 ? 'post-card__vote-btn is-active' : 'post-card__vote-btn'
                    }
                    onClick={() => handlePostVote(1)}
                    aria-pressed={postVote === 1}
                    disabled={postVotePending}
                  >
                    赞
                  </button>
                  <span className="post-card__vote-score" aria-label={`分值 ${postScore}`}>
                    {postScore}
                  </span>
                  <button
                    type="button"
                    className={
                      postVote === -1
                        ? 'post-card__vote-btn is-active'
                        : 'post-card__vote-btn'
                    }
                    onClick={() => handlePostVote(-1)}
                    aria-pressed={postVote === -1}
                    disabled={postVotePending}
                  >
                    踩
                  </button>
                </div>
                <button type="button" className="post-card__action" onClick={handleFocusComment}>
                  评论
                  <span className="post-card__action-count">
                    {typeof state.data.comment_count === 'number'
                      ? state.data.comment_count
                      : commentsState.data.length}
                  </span>
                </button>
                <button type="button" className="post-card__action" onClick={handlePostShare}>
                  {postShareLabel}
                </button>
              </div>
              {postHint ? <div className="post-card__hint">{postHint}</div> : null}
              <div className="post-comments">
                <div className="post-comments__header">评论</div>
                {commentsState.loading ? (
                  <div className="page-status">正在加载评论...</div>
                ) : commentsState.error ? (
                  <ErrorState message={commentsState.error} onRetry={loadComments} />
                ) : commentsState.data.length > 0 ? (
                  <div className="comment-list">
                    {threadedComments.map((comment) => renderComment(comment, 0))}
                  </div>
                ) : null}

                {commentError ? <div className="form-error">{commentError}</div> : null}

                <form className="comment-form" onSubmit={handleCommentSubmit}>
                  {replyTarget ? (
                    <div className="comment-reply">
                      回复 @{replyTarget.nickname}
                      <button
                        type="button"
                        className="comment-reply__cancel"
                        onClick={() => setReplyTarget(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : null}
                  <div className="editor-shell">
                    <TagInput
                      value={commentTags}
                      onChange={setCommentTags}
                      maxTags={6}
                      placeholder="Add tags"
                    />
                    <RichEditor
                      ref={commentEditorRef}
                      value={commentDraft}
                      onChange={setCommentDraft}
                      onImageUpload={handleInlineImageUpload}
                      deferredUpload
                      placeholder="Body text (optional)"
                      disabled={commentSubmitting}
                    />
                    {commentDraftHint ? (
                      <div className="draft-hint">{commentDraftHint}</div>
                    ) : null}
                    <div className="editor-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleSaveCommentDraft}
                        disabled={commentSubmitting}
                      >
                        Save Draft
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={commentSubmitting || !canSubmitComment}
                      >
                        {commentSubmitting ? '提交中...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </form>
                {!user ? (
                  <div className="form-note">
                    未登录将跳转至登录页。
                    <Link className="retry-button" to="/login" state={{ from: `/post/${id}` }}>
                      去登录
                    </Link>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default PostPlaceholder

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getErrorMessage } from '../api/client'
import {
  createComment,
  fetchComments,
  fetchPostDetail,
  type CommentItem,
  type PostDetail,
} from '../api/posts'
import SiteHeader from '../components/SiteHeader'
import { ErrorState } from '../components/StateBlocks'
import { useAuth } from '../context/AuthContext'

type LoadState<T> = {
  data: T
  loading: boolean
  error: string | null
}

const PostPlaceholder = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const [commentDraft, setCommentDraft] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const loadPost = useCallback(async () => {
    if (!id) {
      setState({ data: null, loading: false, error: '无效的帖子ID' })
      return
    }

    setState({ data: null, loading: true, error: null })

    try {
      const data = await fetchPostDetail(id)
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

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCommentError(null)

    if (!id) {
      setCommentError('无效的帖子ID')
      return
    }

    if (!commentDraft.trim()) {
      setCommentError('请输入评论内容')
      return
    }

    setCommentSubmitting(true)

    try {
      await createComment(id, commentDraft.trim())
      setCommentDraft('')
      await loadComments()
    } catch (error) {
      setCommentError(getErrorMessage(error))
    } finally {
      setCommentSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="post-placeholder">
        <div className="post-placeholder__card">
          <button
            type="button"
            className="back-link"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1)
              } else {
                navigate('/')
              }
            }}
          >
            ← 返回
          </button>
          {state.loading ? (
            <div className="page-status">正在加载帖子...</div>
          ) : state.error ? (
            <ErrorState message={state.error} onRetry={loadPost} />
          ) : state.data ? (
            <>
              <div className="post-placeholder__title">{state.data.title}</div>
              <div className="post-detail__meta">
                {state.data.author.nickname} · {state.data.created_at}
              </div>
              <div className="post-detail__content">{state.data.content}</div>
              <div className="post-comments">
                <div className="post-comments__header">评论</div>
                {commentsState.loading ? (
                  <div className="page-status">正在加载评论...</div>
                ) : commentsState.error ? (
                  <ErrorState message={commentsState.error} onRetry={loadComments} />
                ) : commentsState.data.length === 0 ? (
                  <div className="page-status">暂无评论，欢迎分享想法。</div>
                ) : (
                  <div className="comment-list">
                    {commentsState.data.map((comment) => (
                      <div key={comment.id} className="comment-item">
                        <div className="comment-meta">
                          {comment.author.nickname} · {comment.created_at}
                        </div>
                        <div className="comment-content">{comment.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {user ? (
                  <form className="comment-form" onSubmit={handleCommentSubmit}>
                    <label className="form-field">
                      <span className="form-label">发表评论</span>
                      <textarea
                        className="form-textarea"
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        placeholder="写下你的观点..."
                        rows={4}
                        required
                      />
                    </label>
                    {commentError ? <div className="form-error">{commentError}</div> : null}
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={commentSubmitting}
                    >
                      {commentSubmitting ? '提交中...' : '发布评论'}
                    </button>
                  </form>
                ) : (
                  <div className="form-note">
                    登录后才能评论。
                    <Link className="retry-button" to="/login" state={{ from: `/post/${id}` }}>
                      去登录
                    </Link>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default PostPlaceholder

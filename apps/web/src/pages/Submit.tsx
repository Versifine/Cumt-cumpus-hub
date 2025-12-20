import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBoards } from '../api/boards'
import { getErrorMessage } from '../api/client'
import { createPost } from '../api/posts'
import type { Board } from '../api/boards'
import SectionCard from '../components/SectionCard'
import SiteHeader from '../components/SiteHeader'
import { ErrorState } from '../components/StateBlocks'

const Submit = () => {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [boardId, setBoardId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadBoards = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const data = await fetchBoards()
      setBoards(data)
      if (data.length > 0) {
        setBoardId((prev) => prev || data[0].id)
      }
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBoards()
  }, [loadBoards])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (boards.length === 0) {
      return
    }

    if (!title.trim() || !content.trim()) {
      setSubmitError('请填写标题和内容')
      return
    }

    if (!boardId) {
      setSubmitError('请选择版块')
      return
    }

    setSubmitting(true)

    try {
      await createPost({
        board_id: boardId,
        title: title.trim(),
        content: content.trim(),
      })
      navigate('/')
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="form-page">
        <SectionCard title="发布帖子">
          {loading ? (
            <div className="page-status">正在加载版块...</div>
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={loadBoards} />
          ) : (
            <form className="post-form" onSubmit={handleSubmit}>
              {boards.length === 0 ? (
                <div className="form-note">
                  暂无版块，暂时无法发帖。请先在后端初始化至少一个版块。
                </div>
              ) : null}
              <label className="form-field">
                <span className="form-label">版块</span>
                <select
                  className="form-select"
                  value={boards.length === 0 ? '' : boardId}
                  onChange={(event) => setBoardId(event.target.value)}
                  disabled={boards.length === 0}
                >
                  {boards.length === 0 ? (
                    <option value="">暂无版块</option>
                  ) : (
                    boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">标题</span>
                <input
                  className="form-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="请输入帖子标题"
                  required
                />
              </label>
              <label className="form-field">
                <span className="form-label">内容</span>
                <textarea
                  className="form-textarea"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="写点什么..."
                  rows={6}
                  required
                />
              </label>

              {submitError ? <div className="form-error">{submitError}</div> : null}

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || boards.length === 0}
                >
                  {submitting ? '提交中...' : '发布'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (window.history.length > 1) {
                      navigate(-1)
                    } else {
                      navigate('/')
                    }
                  }}
                  disabled={submitting}
                >
                  取消
                </button>
              </div>
            </form>
          )}
        </SectionCard>
      </main>
    </div>
  )
}

export default Submit

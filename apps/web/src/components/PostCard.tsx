import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PostItem } from '../api/posts'
import { clearVote, votePost } from '../api/posts'
import { getErrorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

type PostCardProps = {
  post: PostItem
}

type VoteState = -1 | 0 | 1

const formatRelativeTime = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 0) {
    return value
  }

  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays}天前`
  }

  return parsed.toLocaleDateString()
}

const getBoardName = (post: PostItem) => {
  const record = post as PostItem & {
    board?: { name?: string }
    board_name?: string
  }
  const boardName = record.board?.name ?? record.board_name
  if (!boardName || typeof boardName !== 'string') {
    return null
  }
  const trimmed = boardName.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getCommentCount = (post: PostItem) => {
  const record = post as PostItem & {
    comment_count?: number
    comments?: number
    reply_count?: number
  }
  const count = record.comment_count ?? record.comments ?? record.reply_count
  return typeof count === 'number' ? count : 0
}

const normalizeVote = (value: number | undefined): VoteState => {
  if (value === 1) {
    return 1
  }
  if (value === -1) {
    return -1
  }
  return 0
}

const PostCard = ({ post }: PostCardProps) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const timeLabel = formatRelativeTime(post.created_at)
  const boardName = getBoardName(post)
  const commentCount = getCommentCount(post)
  const baseScore = typeof post.score === 'number' ? post.score : 0
  const baseVote = normalizeVote(post.my_vote)
  const content = post.content?.trim()

  const [vote, setVote] = useState<VoteState>(baseVote)
  const [score, setScore] = useState(baseScore)
  const [shareLabel, setShareLabel] = useState('分享')
  const [pending, setPending] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    setVote(baseVote)
    setScore(baseScore)
  }, [baseVote, baseScore, post.id])

  const metaItems = [post.author.nickname, timeLabel].filter(
    (item): item is string => Boolean(item),
  )

  const navigateToPost = () => {
    navigate(`/post/${post.id}`)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateToPost()
    }
  }

  const stopCardNavigation = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const stopCardPropagation = (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => {
    event.stopPropagation()
  }

  const handleVote = (nextVote: VoteState) => async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    stopCardNavigation(event)
    setHint(null)

    if (!user) {
      setHint('请先登录后再投票')
      return
    }

    if (pending) {
      return
    }

    setPending(true)

    try {
      const response =
        nextVote === vote
          ? await clearVote(post.id)
          : await votePost(post.id, nextVote)

      setVote(normalizeVote(response.my_vote))
      setScore(response.score)
    } catch (error) {
      setHint(getErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  const handleComment = (event: MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event)
    navigateToPost()
  }

  const handleShare = async (event: MouseEvent<HTMLButtonElement>) => {
    stopCardNavigation(event)

    const url = new URL(`/post/${post.id}`, window.location.origin).toString()

    try {
      await navigator.clipboard.writeText(url)
      setShareLabel('已复制')
    } catch {
      setShareLabel('复制失败')
    } finally {
      window.setTimeout(() => setShareLabel('分享'), 1500)
    }
  }

  return (
    <article
      className="post-card"
      role="link"
      tabIndex={0}
      aria-label={post.title}
      onClick={navigateToPost}
      onKeyDown={handleCardKeyDown}
    >
      <div className="post-card__body">
        <div className="post-card__top">
          <h3 className="post-card__title">{post.title}</h3>
          <details className="action-menu post-card__menu">
            <summary
              className="action-menu__trigger"
              aria-label="更多操作"
              onClick={stopCardPropagation}
              onKeyDown={stopCardPropagation}
            >
              ...
            </summary>
            <div className="action-menu__panel" role="menu" onClick={stopCardPropagation}>
              <span className="action-menu__empty">暂无操作</span>
            </div>
          </details>
        </div>
        <div className="post-card__meta">
          {metaItems.map((item, index) => (
            <span key={`${item}-${index}`} className="post-card__meta-item">
              {item}
            </span>
          ))}
          {boardName ? <span className="post-card__badge">{boardName}</span> : null}
        </div>
        {content ? <p className="post-card__content">{content}</p> : null}
        <div className="post-card__actions">
          <div className="post-card__vote-group" aria-label="点赞与点踩">
            <button
              type="button"
              className={vote === 1 ? 'post-card__vote-btn is-active' : 'post-card__vote-btn'}
              onClick={handleVote(1)}
              aria-pressed={vote === 1}
              disabled={pending}
            >
              赞
            </button>
            <span className="post-card__vote-score" aria-label={`分值 ${score}`}>
              {score}
            </span>
            <button
              type="button"
              className={vote === -1 ? 'post-card__vote-btn is-active' : 'post-card__vote-btn'}
              onClick={handleVote(-1)}
              aria-pressed={vote === -1}
              disabled={pending}
            >
              踩
            </button>
          </div>
          <button type="button" className="post-card__action" onClick={handleComment}>
            评论
            <span className="post-card__action-count">{commentCount}</span>
          </button>
          <button type="button" className="post-card__action" onClick={handleShare}>
            {shareLabel}
          </button>
        </div>
        {hint ? <div className="post-card__hint">{hint}</div> : null}
      </div>
    </article>
  )
}

export default PostCard

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBoards } from '../api/boards'
import { getErrorMessage } from '../api/client'
import { fetchPosts } from '../api/posts'
import BoardList from '../components/BoardList'
import PostCard from '../components/PostCard'
import SectionCard from '../components/SectionCard'
import SiteHeader from '../components/SiteHeader'
import { EmptyState, ErrorState } from '../components/StateBlocks'
import { BoardSkeletonList, PostSkeletonList } from '../components/Skeletons'
import type { Board } from '../api/boards'
import type { PostItem } from '../api/posts'

type LoadState<T> = {
  data: T
  loading: boolean
  error: string | null
}

const Home = () => {
  const [boardsState, setBoardsState] = useState<LoadState<Board[]>>({
    data: [],
    loading: true,
    error: null,
  })
  const [postsState, setPostsState] = useState<LoadState<PostItem[]>>({
    data: [],
    loading: true,
    error: null,
  })
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)

  const loadBoards = useCallback(async () => {
    setBoardsState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const data = await fetchBoards()
      setBoardsState({ data, loading: false, error: null })
    } catch (error) {
      setBoardsState({
        data: [],
        loading: false,
        error: getErrorMessage(error),
      })
    }
  }, [])

  const loadPosts = useCallback(async () => {
    setPostsState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const data = await fetchPosts(1, 20, activeBoardId ?? undefined)
      setPostsState({ data: data.items, loading: false, error: null })
    } catch (error) {
      setPostsState({
        data: [],
        loading: false,
        error: getErrorMessage(error),
      })
    }
  }, [activeBoardId])

  useEffect(() => {
    void loadBoards()
    void loadPosts()
  }, [loadBoards, loadPosts])

  const activeBoard = boardsState.data.find(
    (board) => board.id === activeBoardId,
  )

  return (
    <div className="app-shell">
      <SiteHeader />
      <div className="layout">
        <aside className="sidebar sidebar-left">
          <SectionCard title="Boards">
            {boardsState.loading ? (
              <BoardSkeletonList count={5} />
            ) : boardsState.error ? (
              <ErrorState message={boardsState.error} onRetry={loadBoards} />
            ) : boardsState.data.length === 0 ? (
              <EmptyState
                title="No boards yet"
                description="Once boards are created, they will show up here."
              />
            ) : (
              <BoardList
                boards={boardsState.data}
                activeBoardId={activeBoardId}
                onSelect={setActiveBoardId}
              />
            )}
          </SectionCard>
        </aside>

        <main className="feed" aria-live="polite">
          <SectionCard
            title={activeBoard ? 'Board Posts' : 'Latest Posts'}
            actions={
              <div className="filter-pill">
                <span>{activeBoard ? activeBoard.name : 'All Boards'}</span>
                {activeBoard ? (
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={() => setActiveBoardId(null)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            }
          >
            {postsState.loading ? (
              <PostSkeletonList count={4} />
            ) : postsState.error ? (
              <ErrorState message={postsState.error} onRetry={loadPosts} />
            ) : postsState.data.length === 0 ? (
              <EmptyState
                title="No posts yet"
                description={
                  activeBoard
                    ? 'This board has no posts yet.'
                    : 'Be the first to start a discussion.'
                }
                action={
                  <Link className="retry-button" to="/post/demo">
                    查看示例帖子
                  </Link>
                }
              />
            ) : (
              <div className="post-list">
                {postsState.data.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </SectionCard>
        </main>

        <aside className="sidebar sidebar-right">
          <SectionCard title="Bulletin">
            <div className="bulletin">
              <div className="bulletin__title">Campus Updates</div>
              <p className="bulletin__text">
                Weekly highlights and campus-wide notices will appear here.
              </p>
              <div className="bulletin__hint">Stay tuned for more.</div>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}

export default Home

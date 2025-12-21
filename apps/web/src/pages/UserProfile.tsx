import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchPosts, type PostItem } from '../api/posts'
import { fetchCurrentUser } from '../api/users'
import { getErrorMessage } from '../api/client'
import PostCard from '../components/PostCard'
import ProfileHeader from '../components/profile/ProfileHeader'
import ProfileStats from '../components/profile/ProfileStats'
import ProfileTabs from '../components/profile/ProfileTabs'
import SiteHeader from '../components/SiteHeader'
import { ErrorState } from '../components/StateBlocks'
import { PostSkeletonList } from '../components/Skeletons'
import { useAuth } from '../context/AuthContext'
import { formatRelativeTimeUTC8 } from '../utils/time'

type LoadState<T> = {
  data: T
  loading: boolean
  error: string | null
}

type ProfileData = {
  id: string
  nickname: string
  bio?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
  createdAt?: string | null
  followersCount?: number | null
  followingCount?: number | null
}

const tabs = [
  { id: 'posts', label: '帖子 Posts' },
  { id: 'comments', label: '评论 Comments' },
]

const UserProfile = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('posts')
  const [profileState, setProfileState] = useState<LoadState<ProfileData | null>>({
    data: null,
    loading: true,
    error: null,
  })
  const [postsState, setPostsState] = useState<LoadState<PostItem[]>>({
    data: [],
    loading: true,
    error: null,
  })

  const isSelf = Boolean(user && id && user.id === id)

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  const loadProfile = useCallback(async () => {
    if (!id) {
      setProfileState({
        data: null,
        loading: false,
        error: '无效的用户ID / Invalid user ID',
      })
      setPostsState({ data: [], loading: false, error: null })
      return
    }

    setProfileState((prev) => ({ ...prev, loading: true, error: null }))
    setPostsState((prev) => ({ ...prev, loading: true, error: null }))

    let createdAt: string | null = null
    let nickname = `用户 ${id}`

    if (isSelf && user?.nickname) {
      nickname = user.nickname
    }

    if (isSelf) {
      try {
        const me = await fetchCurrentUser()
        createdAt = me.created_at
        nickname = me.nickname || nickname
      } catch {
        // keep fallback profile data
      }
    }

    try {
      const posts = await fetchPosts(1, 20)
      const filtered = posts.items.filter((post) => String(post.author.id) === id)
      if (filtered.length > 0) {
        nickname = filtered[0].author.nickname || nickname
      }
      setPostsState({ data: filtered, loading: false, error: null })
    } catch (error) {
      setPostsState({
        data: [],
        loading: false,
        error: getErrorMessage(error),
      })
    }

    setProfileState({
      data: {
        id,
        nickname,
        createdAt,
        bio: null,
        avatarUrl: null,
        coverUrl: null,
        followersCount: null,
        followingCount: null,
      },
      loading: false,
      error: null,
    })
  }, [id, isSelf, user?.nickname])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const statsPosts = useMemo(() => postsState.data.length, [postsState.data.length])

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="profile-page page-enter">
        <button type="button" className="back-link" onClick={handleBack}>
          ← 返回 Back
        </button>

        {profileState.loading ? (
          <div className="profile-skeleton">
            <div className="profile-skeleton__cover" />
            <div className="profile-skeleton__body">
              <div className="skeleton-line skeleton-line--wide" />
              <div className="skeleton-line" />
              <div className="profile-skeleton__stats">
                <div className="skeleton-line skeleton-line--short" />
                <div className="skeleton-line skeleton-line--short" />
              </div>
            </div>
          </div>
        ) : profileState.error ? (
          <ErrorState message={profileState.error} onRetry={loadProfile} />
        ) : profileState.data ? (
          <>
            <ProfileHeader
              nickname={profileState.data.nickname}
              bio={profileState.data.bio}
              avatarUrl={profileState.data.avatarUrl}
              coverUrl={profileState.data.coverUrl}
            />

            <section className="profile-card">
              <div className="profile-card__row">
                <span className="profile-card__label">用户ID / User ID</span>
                <span className="profile-card__value">{profileState.data.id}</span>
              </div>
              <div className="profile-card__row">
                <span className="profile-card__label">注册时间 / Joined</span>
                <span className="profile-card__value">
                  {profileState.data.createdAt
                    ? formatRelativeTimeUTC8(profileState.data.createdAt)
                    : '—'}
                </span>
              </div>
              <ProfileStats
                posts={statsPosts}
                comments={null}
                followers={profileState.data.followersCount}
                following={profileState.data.followingCount}
              />
              <div className="profile-actions">
                {isSelf ? (
                  <button type="button" className="btn btn-ghost" disabled>
                    编辑资料 Edit
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-ghost" disabled>
                      关注 Follow
                    </button>
                    <button type="button" className="btn btn-ghost" disabled>
                      私信 Message
                    </button>
                  </>
                )}
              </div>
            </section>

            <ProfileTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            <section className="profile-content">
              {activeTab === 'posts' ? (
                postsState.loading ? (
                  <PostSkeletonList count={3} />
                ) : postsState.error ? (
                  <ErrorState message={postsState.error} onRetry={loadProfile} />
                ) : postsState.data.length === 0 ? (
                  <div className="page-status">TA 还没有发过帖子 / No posts yet</div>
                ) : (
                  <div className="post-list">
                    {postsState.data.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )
              ) : (
                <div className="page-status">评论功能建设中 / Comments coming soon</div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default UserProfile

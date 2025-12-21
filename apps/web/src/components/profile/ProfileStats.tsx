type ProfileStatsProps = {
  posts?: number | null
  comments?: number | null
  following?: number | null
  followers?: number | null
}

const renderStatValue = (value?: number | null) =>
  typeof value === 'number' ? value : '—'

const ProfileStats = ({ posts, comments, following, followers }: ProfileStatsProps) => (
  <div className="profile-stats">
    <div className="profile-stat">
      <div className="profile-stat__value">{renderStatValue(posts)}</div>
      <div className="profile-stat__label">帖子 Posts</div>
    </div>
    <div className="profile-stat">
      <div className="profile-stat__value">{renderStatValue(comments)}</div>
      <div className="profile-stat__label">评论 Comments</div>
    </div>
    <div className="profile-stat">
      <div className="profile-stat__value">{renderStatValue(following)}</div>
      <div className="profile-stat__label">关注 Following</div>
    </div>
    <div className="profile-stat">
      <div className="profile-stat__value">{renderStatValue(followers)}</div>
      <div className="profile-stat__label">粉丝 Followers</div>
    </div>
  </div>
)

export default ProfileStats

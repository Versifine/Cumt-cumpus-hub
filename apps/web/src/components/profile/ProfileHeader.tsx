import Avatar from './Avatar'
import Cover from './Cover'

type ProfileHeaderProps = {
  nickname: string
  bio?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
}

const ProfileHeader = ({ nickname, bio, avatarUrl, coverUrl }: ProfileHeaderProps) => (
  <section className="profile-header">
    <Cover src={coverUrl} />
    <div className="profile-header__content">
      <Avatar name={nickname} src={avatarUrl} />
      <div className="profile-header__info">
        <h1 className="profile-name">{nickname}</h1>
        {bio ? (
          <p className="profile-bio">{bio}</p>
        ) : (
          <p className="profile-bio profile-bio--empty">还没有签名 / No bio yet</p>
        )}
      </div>
    </div>
  </section>
)

export default ProfileHeader

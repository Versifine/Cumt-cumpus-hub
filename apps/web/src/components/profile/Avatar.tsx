type AvatarProps = {
  name: string
  src?: string | null
  size?: number
}

const Avatar = ({ name, src, size = 96 }: AvatarProps) => {
  const label = name.trim() || 'User'
  const initial = label.charAt(0).toUpperCase()

  return (
    <div
      className="profile-avatar"
      style={{ ['--avatar-size' as string]: `${size}px` }}
    >
      {src ? (
        <img className="profile-avatar__image" src={src} alt={label} />
      ) : (
        <span className="profile-avatar__initial" aria-hidden="true">
          {initial}
        </span>
      )}
    </div>
  )
}

export default Avatar

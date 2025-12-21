type InlineAvatarProps = {
  name: string
  src?: string | null
  size?: number
}

const InlineAvatar = ({ name, src, size = 28 }: InlineAvatarProps) => {
  const label = name.trim() || 'User'
  const initial = label.charAt(0).toUpperCase()

  return (
    <span
      className="inline-avatar"
      role="img"
      aria-label={label}
      style={{ ['--avatar-size' as string]: `${size}px` }}
    >
      {src ? (
        <img className="inline-avatar__image" src={src} alt={label} />
      ) : (
        <span className="inline-avatar__initial" aria-hidden="true">
          {initial}
        </span>
      )}
    </span>
  )
}

export default InlineAvatar

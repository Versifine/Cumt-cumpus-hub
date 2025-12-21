type CoverProps = {
  src?: string | null
}

const Cover = ({ src }: CoverProps) => (
  <div
    className={src ? 'profile-cover profile-cover--image' : 'profile-cover'}
    style={src ? { backgroundImage: `url(${src})` } : undefined}
  >
    <div className="profile-cover__pattern" aria-hidden="true" />
  </div>
)

export default Cover

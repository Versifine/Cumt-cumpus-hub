const SiteHeader = () => (
  <header className="top-nav">
    <div className="nav-inner">
      <div className="brand">Campus Hub</div>
      <div className="nav-search">
        <input
          className="search-input"
          type="search"
          placeholder="Search boards and posts"
          aria-label="Search boards and posts"
        />
      </div>
      <div className="nav-actions">
        <button type="button" className="btn btn-ghost">
          Login
        </button>
        <button type="button" className="btn btn-primary" disabled>
          New Post
        </button>
      </div>
    </div>
  </header>
)

export default SiteHeader

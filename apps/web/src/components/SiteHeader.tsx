import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SiteHeader = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="top-nav">
      <div className="nav-inner">
        <Link className="brand" to="/">
          Campus Hub
        </Link>
        <div className="nav-center">
          <nav className="nav-links" aria-label="Primary">
            <NavLink
              end
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              to="/"
            >
              社区
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              to="/chat"
            >
              聊天室
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              to="/resources"
            >
              资源互助
            </NavLink>
          </nav>
          <div className="nav-search">
            <input
              className="search-input"
              type="search"
              placeholder="搜索版块或帖子"
              aria-label="搜索版块或帖子"
            />
          </div>
        </div>
        <div className="nav-actions">
          {user ? (
            <div className="nav-user">
              <span className="nav-username">{user.nickname}</span>
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                退出
              </button>
            </div>
          ) : (
            <Link className="btn btn-ghost" to="/login">
              登录
            </Link>
          )}
          {user ? (
            <Link className="btn btn-primary" to="/submit">
              发帖
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              发帖
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default SiteHeader

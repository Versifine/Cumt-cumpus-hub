import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login, register } from '../api/auth'
import { getErrorMessage } from '../api/client'
import SiteHeader from '../components/SiteHeader'
import { useAuth } from '../context/AuthContext'
import { consumeAuthMessage, setAuth } from '../store/auth'

type AuthMode = 'login' | 'register'

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, setUser } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const message = consumeAuthMessage()
    if (message) {
      setNotice(message)
    }
  }, [])

  const from =
    (location.state as { from?: string } | null | undefined)?.from ?? '/'

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true })
    }
  }, [user, navigate, from])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)

    try {
      const payload =
        mode === 'login'
          ? await login(account.trim(), password)
          : await register(account.trim(), password)

      setAuth(payload.token, payload.user)
      setUser(payload.user)
      navigate(from, { replace: true })
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (location.state && from !== '/') {
      navigate(from, { replace: true })
      return
    }

    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'tab tab--active' : 'tab'}
              onClick={() => setMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'tab tab--active' : 'tab'}
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span className="form-label">账号</span>
              <input
                className="form-input"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder="请输入账号"
                autoComplete="username"
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label">密码</span>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>

            {notice ? <div className="form-note">{notice}</div> : null}
            {error ? <div className="form-error">{error}</div> : null}

            <button
              type="submit"
              className="btn btn-primary form-submit"
              disabled={submitting}
            >
              {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
            <button
              type="button"
              className="btn btn-ghost form-cancel"
              onClick={handleCancel}
              disabled={submitting}
            >
              取消 / 返回
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

export default Login

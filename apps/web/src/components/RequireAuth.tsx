import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, checking } = useAuth()
  const location = useLocation()
  const from = `${location.pathname}${location.search}`

  if (checking) {
    return <div className="page-status">正在校验登录状态...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <>{children}</>
}

export default RequireAuth

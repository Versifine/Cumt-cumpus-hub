import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import router from './router'

type AuthInvalidDetail = {
  from?: string
}

const attachAuthListener = () => {
  const windowRef = window as Window & { __authListenerAttached?: boolean }
  if (windowRef.__authListenerAttached) {
    return
  }

  windowRef.__authListenerAttached = true

  window.addEventListener('auth:invalid', (event) => {
    const detail = (event as CustomEvent<AuthInvalidDetail>).detail
    const currentPath = router.state.location.pathname
    if (currentPath === '/login') {
      return
    }

    router.navigate('/login', {
      replace: true,
      state: { from: detail?.from },
    })
  })
}

attachAuthListener()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)

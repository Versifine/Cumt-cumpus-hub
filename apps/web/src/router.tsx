import { createBrowserRouter } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Chat from './pages/Chat'
import Home from './pages/Home'
import Login from './pages/Login'
import PostPlaceholder from './pages/PostPlaceholder'
import Resources from './pages/Resources'
import Submit from './pages/Submit'
import UserProfile from './pages/UserProfile'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/submit',
    element: (
      <RequireAuth>
        <Submit />
      </RequireAuth>
    ),
  },
  {
    path: '/chat',
    element: (
      <RequireAuth>
        <Chat />
      </RequireAuth>
    ),
  },
  {
    path: '/resources',
    element: (
      <RequireAuth>
        <Resources />
      </RequireAuth>
    ),
  },
  {
    path: '/post/:id',
    element: <PostPlaceholder />,
  },
  {
    path: '/u/:id',
    element: <UserProfile />,
  },
])

export default router

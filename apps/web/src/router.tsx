import { createBrowserRouter } from 'react-router-dom'
import Home from './pages/Home'
import PostPlaceholder from './pages/PostPlaceholder'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/post/:id',
    element: <PostPlaceholder />,
  },
])

export default router

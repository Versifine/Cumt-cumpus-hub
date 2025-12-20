import { Link, useParams } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'

const PostPlaceholder = () => {
  const { id } = useParams()

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="post-placeholder">
        <div className="post-placeholder__card">
          <div className="post-placeholder__title">Post ID: {id}</div>
          <p className="post-placeholder__text">
            Post detail view will be available in the next milestone.
          </p>
          <Link className="back-link" to="/">
            Back to feed
          </Link>
        </div>
      </main>
    </div>
  )
}

export default PostPlaceholder

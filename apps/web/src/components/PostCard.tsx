import { Link } from 'react-router-dom'
import type { PostItem } from '../api/posts'

type PostCardProps = {
  post: PostItem
}

const PostCard = ({ post }: PostCardProps) => {
  const meta = `${post.author.nickname} ¡¤ ${post.created_at}`

  return (
    <Link className="post-card" to={`/post/${post.id}`}>
      <article className="post-card__body">
        <h3 className="post-card__title">{post.title}</h3>
        <div className="post-card__meta">{meta}</div>
      </article>
    </Link>
  )
}

export default PostCard

import { apiRequest } from './client'

export type PostAuthor = {
  id: string
  nickname: string
}

export type PostItem = {
  id: string
  title: string
  author: PostAuthor
  created_at: string
  content?: string
  board?: PostDetailBoard
  score?: number
  comment_count?: number
  award_count?: number
  my_vote?: number
}

export type PostListResponse = {
  items: PostItem[]
  total: number
}

export type PostDetailBoard = {
  id: string
  name: string
}

export type PostDetail = {
  id: string
  board: PostDetailBoard
  author: PostAuthor
  title: string
  content: string
  created_at: string
  deleted_at: string | null
}

export type CreatePostInput = {
  board_id: string
  title: string
  content: string
}

export type CreatePostResponse = {
  id: string
  board_id: string
  author_id: string
  title: string
  content: string
  created_at: string
}

export type CommentItem = {
  id: string
  author: PostAuthor
  content: string
  created_at: string
}

export type CreateCommentResponse = {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
}

export type VoteResponse = {
  post_id: string
  score: number
  my_vote: number
}

export const fetchPosts = (
  page: number,
  pageSize: number,
  boardId?: string,
): Promise<PostListResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })

  if (boardId) {
    params.set('board_id', boardId)
  }

  return apiRequest<PostListResponse>(`/posts?${params.toString()}`)
}

export const fetchPostDetail = (postId: string): Promise<PostDetail> =>
  apiRequest<PostDetail>(`/posts/${postId}`)

export const createPost = (
  payload: CreatePostInput,
): Promise<CreatePostResponse> =>
  apiRequest<CreatePostResponse>('/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const fetchComments = (postId: string): Promise<CommentItem[]> =>
  apiRequest<CommentItem[]>(`/posts/${postId}/comments`)

export const createComment = (
  postId: string,
  content: string,
): Promise<CreateCommentResponse> =>
  apiRequest<CreateCommentResponse>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const votePost = (
  postId: string,
  value: 1 | -1,
): Promise<VoteResponse> =>
  apiRequest<VoteResponse>(`/posts/${postId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })

export const clearVote = (postId: string): Promise<VoteResponse> =>
  apiRequest<VoteResponse>(`/posts/${postId}/votes`, {
    method: 'DELETE',
  })

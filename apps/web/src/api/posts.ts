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
  score?: number
  my_vote?: number
  comment_count?: number
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

export type DeletePostResponse = {
  status: string
}

export type CommentItem = {
  id: string
  author: PostAuthor
  content: string
  created_at: string
  parent_id?: string | null
  score?: number
  my_vote?: number
}

export type CreateCommentResponse = {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  parent_id?: string | null
  score?: number
  my_vote?: number
}

export type DeleteCommentResponse = {
  status: string
}

export type VoteResponse = {
  post_id: string
  score: number
  my_vote: number
}

export type CommentVoteResponse = {
  comment_id: string
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

export const deletePost = (postId: string): Promise<DeletePostResponse> =>
  apiRequest<DeletePostResponse>(`/posts/${postId}`, {
    method: 'DELETE',
  })

export const fetchComments = (postId: string): Promise<CommentItem[]> =>
  apiRequest<CommentItem[]>(`/posts/${postId}/comments`)

export const createComment = (
  postId: string,
  content: string,
  parentId?: string | null,
): Promise<CreateCommentResponse> =>
  apiRequest<CreateCommentResponse>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      ...(parentId ? { parent_id: parentId } : {}),
    }),
  })

export const deleteComment = (
  postId: string,
  commentId: string,
): Promise<DeleteCommentResponse> =>
  apiRequest<DeleteCommentResponse>(`/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  })

export const voteComment = (
  postId: string,
  commentId: string,
  value: 1 | -1,
): Promise<CommentVoteResponse> =>
  apiRequest<CommentVoteResponse>(`/posts/${postId}/comments/${commentId}/votes`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })

export const clearCommentVote = (
  postId: string,
  commentId: string,
): Promise<CommentVoteResponse> =>
  apiRequest<CommentVoteResponse>(`/posts/${postId}/comments/${commentId}/votes`, {
    method: 'DELETE',
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

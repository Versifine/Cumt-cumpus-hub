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
}

export type PostListResponse = {
  items: PostItem[]
  total: number
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

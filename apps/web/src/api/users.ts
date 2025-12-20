import { apiRequest } from './client'

export type CurrentUser = {
  id: string
  nickname: string
  created_at: string
}

export const fetchCurrentUser = (): Promise<CurrentUser> =>
  apiRequest<CurrentUser>('/users/me')

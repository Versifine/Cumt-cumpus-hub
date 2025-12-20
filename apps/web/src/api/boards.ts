import { apiRequest } from './client'

export type Board = {
  id: string
  name: string
  description: string
}

export const fetchBoards = (): Promise<Board[]> => apiRequest<Board[]>('/boards')

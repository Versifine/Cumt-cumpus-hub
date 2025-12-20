import { apiRequest } from './client'
import type { AuthUser } from '../store/auth'

export type AuthResponse = {
  token: string
  user: AuthUser
}

export const login = (account: string, password: string): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  })

export const register = (
  account: string,
  password: string,
): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  })

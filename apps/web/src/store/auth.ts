export type AuthUser = {
  id: string
  nickname: string
}

const TOKEN_KEY = 'campus_hub_token'
const USER_KEY = 'campus_hub_user'
const MESSAGE_KEY = 'campus_hub_auth_message'

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)

export const getStoredUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const setStoredUser = (user: AuthUser): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const setAuth = (token: string, user: AuthUser): void => {
  localStorage.setItem(TOKEN_KEY, token)
  setStoredUser(user)
}

export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export const setAuthMessage = (message: string): void => {
  sessionStorage.setItem(MESSAGE_KEY, message)
}

export const consumeAuthMessage = (): string | null => {
  const message = sessionStorage.getItem(MESSAGE_KEY)
  if (message) {
    sessionStorage.removeItem(MESSAGE_KEY)
  }
  return message
}

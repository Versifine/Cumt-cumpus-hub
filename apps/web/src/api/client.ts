import { clearAuth, getToken, setAuthMessage } from '../store/auth'

export type ApiErrorPayload = {
  code: number
  message: string
}

export class ApiError extends Error {
  code: number

  constructor(payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiError'
    this.code = payload.code
  }
}

const API_PREFIX = '/api/v1'

const isApiErrorPayload = (value: unknown): value is ApiErrorPayload => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as { code?: unknown; message?: unknown }
  return typeof record.code === 'number' && typeof record.message === 'string'
}

const parseError = async (response: Response): Promise<ApiError> => {
  let data: unknown = null

  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (isApiErrorPayload(data)) {
    return new ApiError(data)
  }

  return new ApiError({
    code: response.status,
    message: response.statusText || 'Request failed',
  })
}

const dispatchAuthFailure = () => {
  clearAuth()
  setAuthMessage('登录失效')
  const from = `${window.location.pathname}${window.location.search}`

  window.dispatchEvent(
    new CustomEvent('auth:invalid', {
      detail: { from },
    }),
  )
}

export const apiRequest = async <T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = path.startsWith('/api/') ? path : `${API_PREFIX}${normalizedPath}`
  const headers = new Headers(options.headers)
  const token = options.token ?? getToken()

  headers.set('Accept', 'application/json')

  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  if (options.body && !headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const apiError = await parseError(response)

    if (response.status === 401 || apiError.code === 1001) {
      dispatchAuthFailure()
    }

    throw apiError
  }

  return response.json() as Promise<T>
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Request failed'
}

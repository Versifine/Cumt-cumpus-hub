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

export const apiRequest = async <T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = path.startsWith('/api/') ? path : `${API_PREFIX}${normalizedPath}`
  const headers = new Headers(options.headers)

  headers.set('Accept', 'application/json')

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw await parseError(response)
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

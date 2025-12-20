import { apiRequest } from './client'

export type UploadResponse = {
  id: string
  filename: string
  url: string
}

export const uploadFile = (file: File): Promise<UploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)

  return apiRequest<UploadResponse>('/files', {
    method: 'POST',
    body: formData,
  })
}

import { useState, type FormEvent } from 'react'
import SectionCard from '../components/SectionCard'
import SiteHeader from '../components/SiteHeader'
import { uploadFile, type UploadResponse } from '../api/files'
import { getErrorMessage } from '../api/client'

type UploadItem = UploadResponse & {
  createdAt: string
}

const Resources = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!selectedFile) {
      setError('请选择一个要上传的文件')
      return
    }

    setUploading(true)

    try {
      const result = await uploadFile(selectedFile)
      const item: UploadItem = {
        ...result,
        createdAt: new Date().toISOString(),
      }
      setUploads((prev) => [item, ...prev])
      setNotice('上传成功，已生成下载链接。')
      setSelectedFile(null)
      setInputKey((prev) => prev + 1)
    } catch (uploadError) {
      setError(getErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  const handleCopy = async (item: UploadItem) => {
    const fullUrl = new URL(item.url, window.location.origin).toString()

    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopiedId(item.id)
      setNotice('链接已复制到剪贴板')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('复制失败，请手动复制链接')
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="resources-page page-enter">
        <div className="resources-grid">
          <SectionCard title="Upload Resource">
            <form className="resource-upload" onSubmit={handleSubmit}>
              <label className="form-field">
                <span className="form-label">选择文件</span>
                <input
                  key={inputKey}
                  className="form-input"
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <div className="resource-note">
                建议上传课件、复习资料或工具文档。单次上传上限 10MB。
              </div>

              {notice ? <div className="form-note">{notice}</div> : null}
              {error ? <div className="form-error">{error}</div> : null}

              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? '上传中...' : '上传资源'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Recent Uploads">
            <div className="resource-list">
              {uploads.length === 0 ? (
                <div className="page-status">暂无上传记录。</div>
              ) : (
                uploads.map((item) => (
                  <div key={item.id} className="resource-item">
                    <div className="resource-item__name">{item.filename}</div>
                    <div className="resource-item__meta">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <div className="resource-actions">
                      <a
                        className="btn btn-ghost btn-small"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开
                      </a>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => handleCopy(item)}
                      >
                        {copiedId === item.id ? '已复制' : '复制链接'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </main>
    </div>
  )
}

export default Resources

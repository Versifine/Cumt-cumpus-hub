import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import SectionCard from '../components/SectionCard'
import SiteHeader from '../components/SiteHeader'
import { useAuth } from '../context/AuthContext'
import { getToken } from '../store/auth'

type RoomOption = {
  id: string
  name: string
  description: string
}

type ChatMessage = {
  id: string
  content: string
  createdAt: string
  senderId?: string
  senderName?: string
  isHistory: boolean
}

type Envelope = {
  v: number
  type: string
  requestId?: string
  data?: any
  error?: { code: number; message: string }
}

const rooms: RoomOption[] = [
  {
    id: 'general',
    name: '综合讨论',
    description: '日常交流与校园动态。',
  },
  {
    id: 'study-help',
    name: '课程互助',
    description: '作业难题、课程资料。',
  },
  {
    id: 'resources',
    name: '资源共享',
    description: '复习资料、备考经验。',
  },
]

const buildWsUrl = (token: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`
}

const formatTimestamp = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

const makeRequestId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const Chat = () => {
  const { user } = useAuth()
  const [activeRoom, setActiveRoom] = useState<string>(rooms[0].id)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>(
    'idle',
  )
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const activeRoomLabel =
    rooms.find((room) => room.id === activeRoom)?.name ?? activeRoom

  const connect = useCallback(() => {
    const token = getToken()
    if (!token) {
      setStatus('error')
      setError('未检测到登录信息，请先登录。')
      return
    }

    if (socketRef.current) {
      socketRef.current.close()
    }

    setStatus('connecting')
    setError(null)

    const socket = new WebSocket(buildWsUrl(token))
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setStatus('ready')
    })

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data) as Envelope

        if (payload.type === 'error') {
          setError(payload.error?.message ?? '聊天室连接出现问题')
          return
        }

        if (payload.type === 'chat.history.result') {
          const items = Array.isArray(payload.data?.items) ? payload.data.items : []
          const history = items.map((entry: any) => ({
            id: entry.id,
            content: entry.content,
            createdAt: entry.created_at,
            isHistory: true,
          }))
          setMessages(history)
          return
        }

        if (payload.type === 'chat.message') {
          const data = payload.data ?? {}
          setMessages((prev) => {
            const next = [
              ...prev,
              {
                id: data.id,
                content: data.content,
                createdAt: data.created_at,
                senderId: data.sender?.id,
                senderName: data.sender?.nickname,
                isHistory: false,
              },
            ]
            return next.slice(-200)
          })
        }
      } catch {
        setError('聊天消息解析失败')
      }
    })

    socket.addEventListener('close', () => {
      setStatus('error')
    })

    socket.addEventListener('error', () => {
      setStatus('error')
      setError('聊天室连接失败，请稍后重试。')
    })
  }, [])

  const sendEnvelope = useCallback((payload: Envelope) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false
    }

    socketRef.current.send(JSON.stringify(payload))
    return true
  }, [])

  const joinRoom = useCallback(
    (roomId: string) => {
      setMessages([])

      const joinId = makeRequestId()
      sendEnvelope({
        v: 1,
        type: 'chat.join',
        requestId: joinId,
        data: { roomId },
      })

      const historyId = makeRequestId()
      sendEnvelope({
        v: 1,
        type: 'chat.history',
        requestId: historyId,
        data: { roomId, limit: 50 },
      })
    },
    [sendEnvelope],
  )

  useEffect(() => {
    connect()

    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [connect])

  useEffect(() => {
    if (status === 'ready') {
      joinRoom(activeRoom)
    }
  }, [activeRoom, joinRoom, status])

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const content = draft.trim()
    if (!content) {
      return
    }

    const sent = sendEnvelope({
      v: 1,
      type: 'chat.send',
      requestId: makeRequestId(),
      data: { roomId: activeRoom, content },
    })

    if (sent) {
      setDraft('')
    } else {
      setError('尚未连接到聊天室，请稍后重试。')
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="chat-page page-enter">
        <div className="chat-layout">
          <SectionCard title="Rooms">
            <div className="chat-room-list">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={
                    room.id === activeRoom
                      ? 'chat-room chat-room--active'
                      : 'chat-room'
                  }
                  onClick={() => setActiveRoom(room.id)}
                >
                  <div className="chat-room__name">{room.name}</div>
                  <div className="chat-room__desc">{room.description}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Live Chat">
            <div className="chat-panel">
              <div className="chat-status">
                <span
                  className={
                    status === 'ready' ? 'status-dot status-dot--ok' : 'status-dot'
                  }
                  aria-hidden="true"
                />
                <span>
                  {status === 'ready'
                    ? '已连接'
                    : status === 'connecting'
                      ? '连接中...'
                      : '连接已断开'}
                </span>
                <span className="chat-status__room">{activeRoomLabel}</span>
                <button type="button" className="btn btn-ghost btn-small" onClick={connect}>
                  重新连接
                </button>
              </div>

              {error ? <div className="form-error">{error}</div> : null}

              <div className="chat-messages" role="log" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="page-status">暂无消息，开始聊天吧。</div>
                ) : (
                  messages.map((message) => {
                    const isSelf = message.senderId && message.senderId === user?.id
                    return (
                      <div
                        key={message.id}
                        className={isSelf ? 'chat-message chat-message--self' : 'chat-message'}
                      >
                        <div className="chat-meta">
                          <span className="chat-author">
                            {message.senderName ?? (message.isHistory ? '历史记录' : '匿名')}
                          </span>
                          <span className="chat-time">{formatTimestamp(message.createdAt)}</span>
                        </div>
                        <div className="chat-content">{message.content}</div>
                      </div>
                    )
                  })
                )}
              </div>

              <form className="chat-input" onSubmit={handleSend}>
                <input
                  className="form-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入消息，回车发送"
                  disabled={status !== 'ready'}
                  aria-label="聊天输入"
                />
                <button type="submit" className="btn btn-primary" disabled={status !== 'ready'}>
                  发送
                </button>
              </form>
            </div>
          </SectionCard>
        </div>
      </main>
    </div>
  )
}

export default Chat

# docs/ws-protocol.md — campus-hub WebSocket 协议（v0.1）

> 本文档定义 **campus-hub Demo 阶段** 的 WebSocket 通信协议。
>
> 目标：
>
> * 为 Web 客户端提供稳定的实时聊天能力
> * 为未来 Kotlin Multiplatform 客户端提供 **可复用、可演进的协议契约**
>
> 原则：
>
> * 协议稳定优先于实现细节
> * 明确版本号，允许向后兼容

---

## 1. 基本约定

### 1.1 连接方式

* WebSocket URL：

```
/ws/chat?token={AUTH_TOKEN}
```

* 认证方式：

  * 连接时通过 query 参数携带 token
  * 连接建立后服务端校验身份

---

## 2. 消息信封（Message Envelope）

**所有 WebSocket 消息必须使用统一信封格式。**

```json
{
  "v": 1,
  "type": "event.type",
  "requestId": "uuid",
  "data": {},
  "error": null
}
```

字段说明：

* `v`：协议版本号（当前为 1）
* `type`：事件类型
* `requestId`：客户端生成，用于请求-响应关联（可选）
* `data`：事件数据载体
* `error`：错误信息（成功时为 null）

---

## 3. 事件类型定义

### 3.1 连接成功

服务端 → 客户端

```json
{
  "v": 1,
  "type": "system.connected",
  "data": {
    "userId": "u_123"
  }
}
```

---

### 3.2 加入聊天室

客户端 → 服务端

```json
{
  "v": 1,
  "type": "chat.join",
  "requestId": "req-1",
  "data": {
    "roomId": "public"
  }
}
```

服务端 → 客户端（确认）

```json
{
  "v": 1,
  "type": "chat.joined",
  "requestId": "req-1",
  "data": {
    "roomId": "public"
  }
}
```

---

### 3.3 发送消息

客户端 → 服务端

```json
{
  "v": 1,
  "type": "chat.send",
  "requestId": "req-2",
  "data": {
    "roomId": "public",
    "content": "hello campus"
  }
}
```

---

### 3.4 接收消息

服务端 → 房间内所有客户端

```json
{
  "v": 1,
  "type": "chat.message",
  "data": {
    "id": "m_123",
    "roomId": "public",
    "sender": {
      "id": "u_123",
      "nickname": "匿名用户"
    },
    "content": "hello campus",
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

---

### 3.5 拉取历史消息

客户端 → 服务端

```json
{
  "v": 1,
  "type": "chat.history",
  "requestId": "req-3",
  "data": {
    "roomId": "public",
    "limit": 50
  }
}
```

服务端 → 客户端

```json
{
  "v": 1,
  "type": "chat.history.result",
  "requestId": "req-3",
  "data": {
    "items": [
      {
        "id": "m_1",
        "content": "历史消息",
        "created_at": "2025-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

### 3.6 错误事件

```json
{
  "v": 1,
  "type": "error",
  "requestId": "req-x",
  "error": {
    "code": 3001,
    "message": "room not found"
  }
}
```

---

## 4. 心跳与断线

### 4.1 心跳（可选，Demo 阶段）

客户端 → 服务端

```json
{
  "v": 1,
  "type": "system.ping"
}
```

服务端 → 客户端

```json
{
  "v": 1,
  "type": "system.pong"
}
```

### 4.2 断线重连原则

* 客户端负责重连
* 重连后需重新发送 `chat.join`
* 历史消息通过 `chat.history` 补齐

---

## 5. 协议演进规则

* 协议版本通过 `v` 字段区分
* 新字段只能追加，不能删除或修改语义
* 不同客户端版本可同时在线

---

> 本 WebSocket 协议为 **Demo 阶段 v0.1**，任何变更需同步更新本文档，并记录在 `decision-log.md`。

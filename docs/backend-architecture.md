# Backend Architecture (docs/backend-architecture.md)
#
# NOTE: Keep the first lines ASCII to avoid a Windows sandbox tooling issue
# when applying patches. The actual content starts below in Chinese.

# 后端架构讲解（结合实际代码）

> 目标读者：纯新手。你可以把这份文档当成“读代码导航图”。  
> 范围：仅描述当前仓库 `server/` 的实际实现（Demo 版），并指出一些后续可演进的方向。

## 0. 一句话总结

这是一个用 Go 标准库 `net/http` 搭出来的**单体（Monolith）+ 模块分包**后端：  
`server/main.go` 负责组装依赖、注册路由；各功能模块（auth/community/chat/file）暴露 handler；数据层用 `server/store` 的**内存 Store**暂时代替数据库；JSON 读写由 `server/internal/transport` 统一处理。

## 1. 目录与模块

对应 `docs/spec.md` 中的 `server/` 结构，当前实现大致是这样：

```
server/
  main.go                 # 程序入口：路由、依赖组装、启动 http.Server
  internal/transport/     # HTTP 层 JSON 读写与错误输出
  store/                  # 内存数据存储（Demo 用）
  auth/                   # 登录、读取当前用户、鉴权辅助
  community/              # Boards / Posts / Comments
  file/                   # 上传、下载
  chat/                   # WebSocket + 房间广播（Hub）
```

你可以先从 `server/main.go` 开始看：它相当于“电源开关 + 插线板”，把所有模块接起来。

## 2. 启动方式与配置

后端入口是 `server/main.go`，Go module 在仓库根目录（`go.mod`）。

本地启动（Demo）：

```bash
go run ./server
```

常用环境变量（见 `server/main.go`）：

- `SERVER_ADDR`：监听地址，默认 `:8080`
- `UPLOAD_DIR`：上传目录，默认会尝试 `server/storage`，否则用 `<cwd>/storage`
- `STORE_DRIVER`：数据存储驱动，默认 `memory`（支持：`memory` / `sqlite`）
- `SQLITE_PATH`：当 `STORE_DRIVER=sqlite` 时使用的 SQLite 文件路径；不设置则默认 `<UPLOAD_DIR>/campus-hub.db`

静态站点：

- `server/main.go` 把 `apps/web` 作为静态目录挂载在 `/` 上，所以启动后访问 `http://localhost:8080/` 会打开 Demo 控制台页面。
- 需求约定：Web 前端将使用 Vue 3 + TypeScript + Vite + Naive UI（见 `docs/spec.md` 与 `docs/decision-log.md`）。
  - 开发期更常见的做法是用 Vite Dev Server 跑前端，然后把 `/api`、`/ws` 代理到 Go 后端
  - 生产期把构建产物（通常是 `dist/`）当静态资源部署

### 2.1 切换到 SQLite（把内存 store 换成数据库）

当前仓库已经把数据层抽象成 `server/store/store.go` 的接口 `store.API`，并提供了一个 SQLite 实现：`server/store/sqlite_store.go`。

启动方式（示例）：

```bash
set STORE_DRIVER=sqlite
set SQLITE_PATH=server/storage/campus-hub.db
go run ./server
```

你会看到：

- 重启服务后，用户/帖子/评论/聊天历史不会丢（因为落盘到了 SQLite 文件）
- 仍然保持原来的 ID 形式（例如 `u_1`/`p_1`），所以前端与协议不需要改

## 3. HTTP 请求是怎么走的（REST）

以“获取板块列表”举例（`GET /api/v1/boards`）：

1. 浏览器/前端发起请求到 `/api/v1/boards`
2. `server/main.go` 里的 `ServeMux` 把它路由到 `communityHandler.Boards`
3. `server/community/handlers.go` 里检查 `Method`，然后调用 `h.Store.Boards()`
4. `server/store/store.go` 返回内存里的 boards 列表（拷贝一份，避免外部修改内部切片）
5. `server/internal/transport/transport.go` 把结果写成 JSON 返回给客户端

这种组织方式的核心思想是：  
**main 只负责“接线”（依赖与路由），具体业务逻辑放在模块 handler，数据读写放到 store。**

### 3.1 路由总览（以 main.go 为准）

`server/main.go` 当前注册的关键路由：

- 健康检查：`GET /healthz`
- 认证：
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/users/me`
- 社区：
  - `GET /api/v1/boards`
  - `GET|POST /api/v1/posts`
  - `GET|POST /api/v1/posts/{post_id}/comments`（通过 `"/api/v1/posts/"` 的自定义解析实现）
- 文件：
  - `POST /api/v1/files`
  - `GET /files/{file_id}`
- WebSocket：
  - `GET /ws/chat`（升级到 WebSocket）

## 4. 鉴权与“当前用户”是怎么来的

当前 Demo 已实现“注册 + 登录 + Bearer Token 鉴权”这一整条链路：

- 先注册：`POST /api/v1/auth/register`（账号 + 密码）
- 再登录：`POST /api/v1/auth/login`（账号 + 密码）
- 密码：服务端只保存哈希（bcrypt），不保存明文
- token：服务端生成随机 token（不做过期，后续可加 `expires_at`）

### 4.1 注册与登录

- 入口：
  - 注册：`server/auth/handler.go` 的 `RegisterHandler`
  - 登录：`server/auth/handler.go` 的 `LoginHandler`
- 数据来源：`server/store` 的 `store.API`（内存版/SQLite 版都实现了它）
- 返回：`{ token, user }`

这里的 token 不是 JWT，而是服务端生成的随机字符串（类似 `t_...`），用于演示“登录态”。

### 4.2 REST 接口鉴权（Bearer Token）

需要登录的接口会调用 `auth.Service.RequireUser`：

- 从请求头 `Authorization: Bearer <token>` 取出 token
- 用 `Store.UserByToken(token)` 解析出用户
- 失败则返回 `401` + 错误 JSON（见 `server/internal/transport/transport.go`）

典型例子：发帖/评论、文件上传（见 `server/community/handlers.go`、`server/file/handler.go`）。

### 4.3 WebSocket 鉴权（query token）

WebSocket 的鉴权方式在 Demo 里更简单（见 `server/chat/handler.go`）：

- 连接 URL：`/ws/chat?token=...`
- 服务端升级握手前用 `Store.UserByToken` 校验

## 5. 数据层：为什么现在没有数据库？

`server/store/store.go` 是一个**内存 Store**，用 `map + slice + mutex` 维护所有数据：

- `sync.Mutex`：保证并发安全（多个请求同时读写）
- ID 生成：`u_1` / `p_1` / `c_1` / `f_1` / `m_1`（带前缀，便于肉眼识别类型）
- 时间：统一 `UTC RFC3339`（`time.Now().UTC().Format(time.RFC3339)`）
- 评论支持 `parent_id` 记录楼中楼关系（SQLite comments 表新增 parent_id 字段）。
- 评论点赞/点踩持久化在 comment_votes 表（score 由投票汇总）。

新手建议的理解方式：

- Store 就像“假的数据库”，先让功能跑起来；
- 等你准备上数据库时，把 `Store` 的实现替换掉即可（接口/方法名尽量保持一致）。

## 6. WebSocket：聊天室是怎么实现的

聊天由两部分组成：

1. **Handler（协议与鉴权）**：`server/chat/handler.go`
2. **Hub（房间与广播）**：`server/chat/hub.go`

### 6.1 消息信封（Envelope）

`server/chat/handler.go` 定义了统一信封（`envelope`），字段和 `docs/ws-protocol.md` 对齐：

```json
{ "v": 1, "type": "chat.send", "requestId": "req-1", "data": {}, "error": null }
```

服务端会：

- 读取客户端消息（`conn.ReadJSON(&msg)`）
- 按 `type` 分发到不同 handler（join/send/history/ping）
- 向客户端回写（通过 `Client.Send` channel + `writeLoop`）

### 6.2 房间与广播（Hub）

`Hub` 内部用 `map[roomID]map[*Client]bool` 维护房间成员：

- `Join(roomID, client)`：加入房间
- `Leave(client)`：离开当前房间
- `Broadcast(roomID, payload)`：把消息发给房间内所有 client

这就是最小可用的“聊天室广播”模型：不涉及离线推送、已读回执、消息撤回等复杂能力。

## 7. 文件上传下载：落地在哪里？

文件模块在 `server/file/handler.go`：

- 上传：`POST /api/v1/files`，`multipart/form-data`，字段名 `file`
- 存储：写到 `UploadDir` 指定目录下（文件名会做清理，实际落地名会加时间戳）
- 元信息：通过 `Store.SaveFile(...)` 保存（`file_id` -> `StoragePath`）
- 下载：`GET /files/{file_id}`，用 `http.ServeFile` 直接把本地文件返回

注意：Demo 版下载接口当前**不做鉴权**（更方便演示），后续如果要做权限，需要在下载前校验用户身份与资源归属。

## 8. 你接下来可以怎么改（新手路线图）

如果你要继续把它从 Demo 往“可维护的后端”推进，最典型的演进顺序是：

1. 把路由注册从 `main.go` 拆出（比如每个模块提供 `RegisterRoutes(mux, deps)`）
2. 把 `Store` 换成真正的数据库层（先定义接口，再做实现）
3. 增加中间件：日志、鉴权、请求 ID、CORS、统一错误处理
4. 补充更多边界处理：输入校验、分页返回字段一致性、WebSocket 断线重连策略

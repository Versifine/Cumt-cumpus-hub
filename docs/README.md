# Docs Index (docs/README.md)
#
# NOTE: Keep the first lines ASCII to avoid a Windows sandbox tooling issue
# when applying patches. The actual content starts below in Chinese.

# 文档索引（docs/README.md）

本仓库以文档为主。下面这份索引的目标是：让你（尤其是纯新手）能按顺序把“这个项目是什么、后端怎么跑、接口怎么用、协议怎么对齐”串起来读。

## 推荐阅读顺序

1. `docs/spec.md`：产品与整体架构规划（MVP 范围、模块、数据模型、演进路线）
2. `docs/backend-architecture.md`：后端代码架构讲解（结合 `server/` 实际实现）
3. `docs/api.md`：REST API 设计与接口清单（与后端实现对齐）
4. `docs/ws-protocol.md`：WebSocket 协议（与后端实现对齐）
5. `docs/decision-log.md`：关键决策记录（为什么这么设计、影响是什么）

## 代码入口提示

- 后端入口：`server/main.go`
- Web 前端：`apps/web`（要求：Vue 3 + TypeScript + Vite + Naive UI）
- 内存数据存储：`server/store/store.go`
- SQLite 数据库存储：`server/store/sqlite_store.go`（通过 `STORE_DRIVER=sqlite` 启用）
- HTTP JSON 工具：`server/internal/transport/transport.go`
- 功能模块：
  - 认证：`server/auth/handler.go`
  - 社区（板块/帖子/评论）：`server/community/handlers.go`
  - 文件上传下载：`server/file/handler.go`
  - 实时聊天（WebSocket）：`server/chat/handler.go`、`server/chat/hub.go`

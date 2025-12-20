# docs/api.md — campus-hub REST API 设计（v0.2）

> 本文档定义 **campus-hub Demo 阶段** 的 REST API 设计规范。
>
> 目标：
>
> * 为 Web 客户端提供稳定接口
> * 为后续 Kotlin Multiplatform 客户端迁移提供 **可复用契约**
>
> 说明：
>
> * 本阶段 API 允许演进，但 **路径语义与核心字段需保持稳定**

---

## 1. 设计原则

### 1.1 基本约定

* 所有 API 以 `/api/v1` 为前缀（少数静态/下载类接口例外）
* 使用 JSON 作为数据交换格式（文件上传使用 `multipart/form-data`）
* JSON 字段使用 `snake_case`
* 资源 ID 建议保留前缀（例如 `u_1`、`b_1`、`p_1`、`c_1`、`f_1`、`r_1`）
* 时间统一使用 ISO 8601（RFC3339），例如 `2025-01-01T00:00:00Z`
* 使用 HTTP 状态码 + 统一错误结构
* 认证方式：Bearer Token

### 1.2 响应结构（以当前代码实现为准）

当前 Demo 的实现有两类响应形态（见 `server/internal/transport/transport.go`）：

1. **成功响应**：直接返回业务 JSON（每个接口的“响应”章节描述的那个结构）
2. **错误响应**：返回统一错误结构：

```json
{ "code": 2001, "message": "invalid json" }
```

说明：

- HTTP 状态码用于表达“请求是否成功”（2xx/4xx/5xx）
- 错误体里的 `code/message` 用于给前端显示与做分支处理

---

## 2. Health

### 2.1 健康检查（已实现）

`GET /healthz`

响应：

```json
{ "status": "ok" }
```

---

## 3. 认证 Auth

### 3.1 注册（已实现）

`POST /api/v1/auth/register`

请求：

```json
{
  "account": "string",
  "password": "string"
}
```

响应：

```json
{
  "token": "t_xxx",
  "user": {
    "id": "u_123",
    "nickname": "alice"
  }
}
```

说明：

- Token 当前不设置过期时间，但 **服务重启后会失效**（不保留登录态）。

### 3.2 登录（已实现）

`POST /api/v1/auth/login`

请求：

```json
{
  "account": "string",
  "password": "string"
}
```

响应：

```json
{
  "token": "t_xxx",
  "user": {
    "id": "u_123",
    "nickname": "alice"
  }
}
```

说明：

- Token 当前不设置过期时间，但 **服务重启后会失效**（不保留登录态）。

### 3.3 邮箱/短信/统一认证（规划中）

`docs/需求.md` 提到“短信/邮箱/校内统一认证”，当前仓库未实现。建议后续按下面的接口形态补齐：

- `POST /api/v1/auth/send_code`（发送邮箱/短信验证码）
- `POST /api/v1/auth/verify_code`（校验验证码并换取 token）
- `POST /api/v1/auth/reset_password`（重置密码）

---

## 4. 用户 User

### 4.1 获取当前用户（已实现）

`GET /api/v1/users/me`

响应：

```json
{
  "id": "u_123",
  "nickname": "alice",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

## 5. 版块 Board

### 5.1 获取版块列表（已实现）

`GET /api/v1/boards`

响应：

```json
[
  {
    "id": "b_1",
    "name": "General",
    "description": "General discussion"
  }
]
```

---

## 6. 帖子 Post

### 6.1 帖子列表（已实现）

`GET /api/v1/posts`

查询参数：

* `board_id`（可选）
* `page`
* `page_size`

响应：

```json
{
  "items": [
    {
      "id": "p_1",
      "title": "第一条帖子",
      "author": {
        "id": "u_123",
        "nickname": "alice"
      },
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### 6.2 发帖（已实现）

`POST /api/v1/posts`

鉴权：需要（Bearer Token）

请求：

```json
{
  "board_id": "b_1",
  "title": "string",
  "content": "string"
}
```

说明：

- `board_id` 必须是存在的版块，否则返回 `400` + `{ "code": 2001, "message": "invalid board_id" }`。

响应（示例）：

```json
{
  "id": "p_1",
  "board_id": "b_1",
  "author_id": "u_123",
  "title": "string",
  "content": "string",
  "created_at": "2025-01-01T00:00:00Z",
  "score": 0,
  "my_vote": 0
}
```

---

### 6.3 帖子详情（已实现）

`GET /api/v1/posts/{post_id}`

说明：

- 已实现：返回帖子正文、作者与版块信息。
- 已软删的帖子会返回 `404 not found`（不会返回 `deleted_at`）。

建议响应（示例）：

```json
{
  "id": "p_1",
  "board": { "id": "b_1", "name": "General" },
  "author": { "id": "u_123", "nickname": "alice" },
  "title": "string",
  "content": "string",
  "created_at": "2025-01-01T00:00:00Z",
  "deleted_at": null
}
```

### 6.4 删除帖子（软删，已实现）

`DELETE /api/v1/posts/{post_id}`

鉴权：需要（Bearer Token）

响应：

```json
{ "status": "deleted" }
```

常见错误：

- `401`：未登录/Token 无效（`code=1001`）
- `403`：只能删除自己的帖子（`code=1002`）
- `404`：帖子不存在或已删除（`code=2001`）

---

## 7. 评论 Comment

### 7.1 获取评论列表（已实现）

`GET /api/v1/posts/{post_id}/comments`

说明：

- 若 `post_id` 不存在（或帖子已软删），返回 `404 not found`。

响应：

```json
[
  {
    "id": "c_1",
    "parent_id": null,
    "author": { "id": "u_123", "nickname": "alice" },
    "content": "string",
    "created_at": "2025-01-01T00:00:00Z",
    "score": 0,
    "my_vote": 0
  }
]
```

### 7.2 发表评论（已实现）

`POST /api/v1/posts/{post_id}/comments`

鉴权：需要（Bearer Token）

说明：

- 若 `post_id` 不存在（或帖子已软删），返回 `404 not found`。
- `parent_id` 空表示一级评论，非空表示回复某条评论。
- parent_id 不存在时返回 400 + { "code": 2001, "message": "invalid parent_id" }

请求：

```json
{
  "content": "string",
  "parent_id": "c_0"
}
```

响应（示例）：

```json
{
  "id": "c_1",
  "post_id": "p_1",
  "parent_id": "c_0",
  "author_id": "u_123",
  "content": "string",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

### 7.3 删除评论（软删，已实现）

`DELETE /api/v1/posts/{post_id}/comments/{comment_id}`

鉴权：需要（Bearer Token）

响应：

```json
{ "status": "deleted" }
```

常见错误：

- `401`：未登录/Token 无效（`code=1001`）
- `403`：只能删除自己的评论（`code=1002`）
- `404`：帖子/评论不存在或已删除（`code=2001`）

---


### 7.4 ???????/???????

`POST /api/v1/posts/{post_id}/comments/{comment_id}/votes`

??????Bearer Token?

???
```json
{ "value": 1 }
```

???????
```json
{ "comment_id": "c_1", "score": 12, "my_vote": 1 }
```

`DELETE /api/v1/posts/{post_id}/comments/{comment_id}/votes`

??????Bearer Token?

???????
```json
{ "comment_id": "c_1", "score": 11, "my_vote": 0 }
```

?????
- `400`?value ???`code=2001`?
- `401`????/Token ???`code=1001`?
- `404`???/??????????`code=2001`?

---

## 8. 文件 File

### 8.1 上传附件（已实现）

`POST /api/v1/files`

鉴权：需要（Bearer Token）

请求：

* multipart/form-data
* 字段名：`file`

响应：

```json
{
  "id": "f_123",
  "filename": "example.pdf",
  "url": "/files/f_123"
}
```

---

### 8.2 下载文件（已实现）

`GET /files/{file_id}`

说明：

- 该路径不在 `/api/v1` 前缀下，直接返回文件内容
- `Content-Type` 由 `http.ServeFile` 推断

---

## 9. 举报 Report（已实现）

说明：

- 创建举报需要登录（Bearer Token）。
- 管理员接口通过环境变量 `ADMIN_ACCOUNTS` 控制（逗号/空格分隔，匹配当前用户 `nickname`）。

### 9.1 创建举报

`POST /api/v1/reports`

鉴权：需要（Bearer Token）。

请求体（建议）：

```json
{
  "target_type": "post",
  "target_id": "p_1",
  "reason": "spam",
  "detail": "string"
}
```

响应（示例）：

```json
{
  "id": "r_1",
  "status": "open",
  "created_at": "2025-01-01T00:00:00Z"
}
```

### 9.2 管理员查看举报列表

`GET /api/v1/admin/reports`

鉴权：管理员

查询参数：

* `status`（可选，例如 `open` / `resolved`）
* `page`
* `page_size`

### 9.3 管理员处理举报

`PATCH /api/v1/admin/reports/{report_id}`

鉴权：管理员

请求体（建议）：

```json
{ "status": "resolved", "action": "delete_post", "note": "string" }
```

---

## 10. 访问控制与反滥用（已实现）

`docs/需求.md` 的 P0 要求：

- 游客可看 / 登录可发：已做到“写操作需要 token”（发帖/评论/上传/举报/管理员操作）
- 发帖/评论限流（按 IP + 用户）：已实现

当前限流策略（Demo）：

- `POST /api/v1/posts`：30s 窗口内，按 IP 与 userId 分别限 `5` 次（任一超限即拦截）
- `POST /api/v1/posts/{post_id}/comments`：30s 窗口内，按 IP 与 userId 分别限 `10` 次
- 超限返回 `429 Too Many Requests` + `{ "code": 1005, "message": "rate limited" }`

---

## 11. 错误码约定（示例）

| code | 含义    |
| ---- | ----- |
| 1001 | 未登录   |
| 1002 | 权限不足  |
| 1003 | 登录失败（账号或密码错误） |
| 1004 | 账号已存在（注册时） |
| 1005 | 请求过于频繁（限流） |
| 2001 | 请求错误（参数错误/资源不存在/方法不允许，Demo 阶段） |
| 5000 | 服务端错误 |

---

## 12. 互动与投票（已实现）

### 12.1 对帖子投票（点赞/点踩）

`POST /api/v1/posts/{post_id}/votes`

鉴权：登录用户

请求体：

```json
{ "value": 1 }
```

说明：

* `value` 仅允许 `1`（赞）或 `-1`（踩）
* 重复投同一方向应返回当前结果或做幂等处理

响应（建议）：

```json
{ "post_id": "p_1", "score": 12, "my_vote": 1 }
```

### 12.2 取消投票

`DELETE /api/v1/posts/{post_id}/votes`

鉴权：登录用户

响应（建议）：

```json
{ "post_id": "p_1", "score": 11, "my_vote": 0 }
```

### 12.3 Award

`POST /api/v1/posts/{post_id}/awards`

鉴权：登录用户

说明：

* Award 消耗用户账户资源
* 资源余额与消耗规则另行定义

### 12.4 分享统计（可选）

`POST /api/v1/posts/{post_id}/shares`

- 点赞 / 点踩：`POST /api/v1/posts/{post_id}/votes`
- 取消投票：`DELETE /api/v1/posts/{post_id}/votes`
- Award：`POST /api/v1/posts/{post_id}/awards`
- 分享统计（可选）：`POST /api/v1/posts/{post_id}/shares`

---

> 本 API 文档为 **Demo 阶段 v0.2**，后续修改需同步更新并记录于 `decision-log.md`。

# docs/api.md — campus-hub REST API 设计（v0.1）

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

* 所有 API 以 `/api/v1` 为前缀
* 使用 JSON 作为数据交换格式
* 使用 HTTP 状态码 + 统一错误结构
* 认证方式：Bearer Token

### 1.2 通用响应结构

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

* `code = 0` 表示成功
* `code != 0` 表示业务错误

---

## 2. 认证 Auth

### 2.1 登录

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
  "token": "jwt-token",
  "user": {
    "id": "u_123",
    "nickname": "匿名用户"
  }
}
```

---

## 3. 用户 User

### 3.1 获取当前用户

`GET /api/v1/users/me`

响应：

```json
{
  "id": "u_123",
  "nickname": "匿名用户",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

## 4. 版块 Board

### 4.1 获取版块列表

`GET /api/v1/boards`

响应：

```json
[
  {
    "id": "b_1",
    "name": "综合",
    "description": "综合讨论"
  }
]
```

---

## 5. 帖子 Post

### 5.1 帖子列表

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
        "nickname": "匿名用户"
      },
      "created_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### 5.2 发帖

`POST /api/v1/posts`

请求：

```json
{
  "board_id": "b_1",
  "title": "string",
  "content": "string"
}
```

---

## 6. 评论 Comment

### 6.1 获取评论列表

`GET /api/v1/posts/{post_id}/comments`

### 6.2 发表评论

`POST /api/v1/posts/{post_id}/comments`

请求：

```json
{
  "content": "string"
}
```

---

## 7. 文件 File

### 7.1 上传附件

`POST /api/v1/files`

* multipart/form-data

响应：

```json
{
  "id": "f_123",
  "filename": "example.pdf",
  "url": "/files/f_123"
}
```

---

## 8. 错误码约定（示例）

| code | 含义    |
| ---- | ----- |
| 0    | 成功    |
| 1001 | 未登录   |
| 1002 | 权限不足  |
| 2001 | 参数错误  |
| 5000 | 服务端错误 |

---

> 本 API 文档为 **Demo 阶段 v0.1**，后续修改需同步更新并记录于 `decision-log.md`。

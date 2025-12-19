# docs/spec.md — campus-hub 规格说明（v0.1）

> Repo（暂定）：campus-hub
>
> 产品名（暂定）：校圈

一个面向高校校园的社区平台，融合 **论坛 / 校内墙 / 实时聊天 / 资料互助** 等功能。

本项目以 **工程可扩展性** 为第一目标，采用 **Web + Go 后端** 的方式快速完成 Demo，并在后续阶段平滑迁移至 **Kotlin Multiplatform（KMP）客户端**。

---

## 1. 项目目标

### 1.1 核心目标（Demo 阶段）

* 在寒假周期内完成一个 **可演示、可闭环** 的校园社区 Demo
* 验证核心使用路径：

  * 登录 → 浏览帖子 → 发帖 / 评论 → 实时聊天 → 资料上传下载
* 建立 **稳定的后端 API / WebSocket 协议**，为后续客户端迁移打基础

### 1.2 非目标（明确不做）

* 不做复杂推荐算法
* 不做商业化 / 广告 / 积分体系
* 不做完整 IM（已读回执、离线推送、消息撤回等）
* 不做正式实名认证或学号系统

---

## 2. 整体架构设计

### 2.1 架构原则

* **后端稳定，客户端可替换**
* **协议优先，UI 次之**
* **模块边界清晰，允许演进**

### 2.2 架构总览

* 后端：Go（REST API + WebSocket）
* 客户端（阶段性）：

  * Phase A：Web（验证产品与交互）
  * Phase C：Kotlin Multiplatform（长期客户端）

---

## 3. 功能范围（Demo MVP）

### 3.1 用户与认证

* 基础登录（账号 + token）
* 用户昵称 / 基础资料
* 前端匿名展示（非强匿名）

### 3.2 社区与帖子

* 版块（Boards）
* 帖子（Posts）
* 评论（Comments）
* 点赞 / 基础互动（Reactions）

### 3.3 实时聊天

* 公共聊天室（WebSocket）
* 消息实时广播
* 最近消息拉取（history）

### 3.4 资料分享

* 帖子附件上传
* 文件下载
* 基础权限控制（需登录）

---

## 4. 数据模型（核心实体）

### 4.1 User

* id
* nickname
* created_at

### 4.2 Board

* id
* name
* description

### 4.3 Post

* id
* board_id
* author_id
* title
* content
* created_at

### 4.4 Comment

* id
* post_id
* author_id
* content
* created_at

### 4.5 ChatRoom

* id
* type（public / post）
* ref_id

### 4.6 ChatMessage

* id
* room_id
* sender_id
* content
* created_at

### 4.7 File

* id
* uploader_id
* filename
* storage_key
* created_at

---

## 5. API 设计原则

### 5.1 REST API

* 资源导向（/posts /comments /boards）
* 统一分页格式
* 统一错误码

### 5.2 WebSocket 协议

所有消息统一使用事件信封格式：

```json
{
  "v": 1,
  "type": "chat.message",
  "requestId": "uuid",
  "data": {},
  "error": null
}
```

* 支持协议版本升级
* Web / KMP 客户端共享同一协议定义

---

## 6. 目录结构（Monorepo）

```
campus-hub/
  docs/
    spec.md
    api.md
    ws-protocol.md
    decision-log.md

  server/
    auth/
    community/
    chat/
    file/
    main.go

  apps/
    web/
    kmp/   # Phase C
```

---

## 7. 开发阶段规划

### Phase A：Web + Go Demo（寒假）

* API / WS 协议初版冻结
* 功能闭环跑通
* 基础 UI 与交互完成

### Phase B：工程加固

* OpenAPI 文档
* 协议测试
* 模块边界整理

### Phase C：Kotlin Multiplatform

* shared 模块复用网络与 domain
* Android 客户端优先

---

## 8. 决策与记录

所有关键技术与架构决策需记录在：

```
docs/decision-log.md
```

记录内容包括：

* 决策结论
* 背景原因
* 影响范围

---

## 9. 项目状态

* 当前状态：Demo 设计阶段
* 架构状态：可演进（未冻结）
* 名称状态：campus-hub（暂定）

---

> 本文档为 **工程级规格文档 v0.1**，允许在 Demo 阶段根据实际情况进行修订，但核心架构与协议需谨慎变更。

# docs/frontend-architecture.md - Campus Hub Frontend Architecture (MVP)
# NOTE: Keep the first lines ASCII to avoid a Windows sandbox tooling issue
# when applying patches. The actual content starts below.

# Campus Hub 前端架构说明（MVP）

## 目标
- 面向在校生交付可用的 MVP：社区帖子、实时聊天、课程资源互助。
- 维持当前暖色、编辑感的视觉风格，页面统一。
- 结构简单，寒假期间便于快速迭代。

## MVP 范围
- 社区：浏览板块、查看最新帖子、发帖、评论。
- 聊天：加入房间、查看最近历史、发送消息。
- 资源：上传文件并分享下载链接（后端返回 URL）。

## 页面与路由
- `/` 首页（板块 + 最新帖子）
- `/post/:id` 帖子详情 + 评论
- `/submit` 发帖（需登录）
- `/chat` 实时聊天（需登录）
- `/resources` 资源互助（需登录）
- `/login` 登录 / 注册

## 布局与组件
- 全局壳：`SiteHeader` + 页面内容。
- 卡片结构：统一使用 `SectionCard`。
- 状态处理：`StateBlocks` + 骨架屏。
- 新 UI 块在 `index.css` 中追加样式，保持一致性。

## 状态与数据流
- 登录状态由 `AuthContext` 管理，并持久化到 localStorage。
- REST 请求统一走 `apiRequest`，自动注入 token，登录失效会跳转。
- WebSocket 聊天使用 `/ws/chat?token=...` 与协议封装。

## API 对接（MVP）
- 板块：`GET /api/v1/boards`
- 帖子：`GET /api/v1/posts`，`POST /api/v1/posts`，`GET /api/v1/posts/:id`
- 评论：`GET /api/v1/posts/:id/comments`，`POST /api/v1/posts/:id/comments`
- 文件：`POST /api/v1/files`，`GET /files/:id`
- 聊天：`WS /ws/chat?token=...`

## 体验说明
- 聊天房间先内置少量默认房间（如 综合讨论 / 课程互助 / 资源共享）。
- 资源页只展示“本次会话”的最近上传记录，并提供复制链接。
- 帖子详情页展示评论并支持登录用户发评论。
- 评论支持 parent_id 形成楼中楼，前端按 parent_id 组装树形。
- 评论支持点赞/点踩并持久化（score / my_vote）。

## 帖子列表卡片交互（仿 Reddit）
- 卡片内展示正文预览 + 标题 + 元信息（作者 / 时间 / 板块）。
- 互动区包含：点赞、点踩、分值（初始为 0，需持久化）、评论按钮与评论数。
- Award 按钮消耗用户账户内资源（积分/币），详情规则后端补充。
- 分享按钮先做基础复制链接，后续可扩展为社交分享。

## MVP 不做的内容
- 管理后台与审核流程。
- 全局搜索。
- 复杂权限或角色系统。

## 后续方向
- 增加分页与按板块筛选。
- 资源打标签（课程/学期/类型）并后端列表化。
- 通知系统（@提及 / 回复 / 聊天提醒）。

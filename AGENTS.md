# Repository Guidelines

## 项目结构与模块组织

本仓库以文档为主，核心内容在 `docs/`。主要文件包括：`docs/spec.md`
（产品与架构规划）、`docs/api.md`（REST 设计）、`docs/ws-protocol.md`
（WebSocket 协议）、`docs/decision-log.md`（关键决策记录）。
`docs/spec.md` 中提到的 `server/`、`apps/` 等目录目前未出现在仓库内。

## 构建、测试与本地开发命令

当前没有内置构建或运行脚本，也没有固定的 `npm test`、`go test` 命令。
日常工作以编辑与审阅 Markdown 为主，建议在编辑器中预览渲染效果；
相关设置在 `docs/.vscode/settings.json`。若后续引入工具链，请在此处
补充命令示例与作用说明。

## 代码风格与命名约定

- 文档采用 Markdown，标题清晰、段落简短。
- `docs/` 下文件名使用 kebab-case，例如 `decision-log.md`。
- 能用标准 Markdown 就不用 HTML；如必须使用，请保持结构简洁。
- `markdownlint` 配置已在 `docs/.vscode/settings.json` 中指定。

## 测试指南

暂无自动化测试。变更后请自行检查：
- 预览渲染是否正常。
- 文档间的引用、协议字段是否一致。
若新增测试或校验脚本，请补充运行方式与预期输出。

## 提交与拉取请求规范

此仓库未包含 Git 历史，无法推断既有提交格式。提交信息请遵循团队约定，
保持简短、动词开头。PR 需包含变更摘要、影响到的文档范围，并在涉及
协议或 API 变更时同步更新 `docs/decision-log.md`。

## 文档更新流程

对 `docs/api.md` 或 `docs/ws-protocol.md` 的修改，通常需要同步更新
`docs/spec.md`。保持文档之间的术语与字段一致，避免引入相互矛盾的描述。


## 尽量用中文回复
# Repository Guidelines

## Project Structure & Module Organization

This repository is documentation-first. The only source of truth lives under `docs/`.
Key references include `docs/spec.md` for the product and architecture plan,
`docs/api.md` for REST details, `docs/ws-protocol.md` for WebSocket events, and
`docs/decision-log.md` for decisions. The spec describes future folders like
`server/` and `apps/`, but they are not present in this repo today.

## Build, Test, and Development Commands

There are no build or runtime commands checked in. Workflows are manual:
- Edit Markdown files in `docs/`.
- Preview Markdown in your editor (VS Code settings live in `docs/.vscode/settings.json`).
If you introduce tooling later, update this section with exact commands.

## Coding Style & Naming Conventions

- Markdown is the primary format. Prefer clear headings and short paragraphs.
- File names in `docs/` use kebab-case (for example, `decision-log.md`).
- Keep sections scoped and descriptive; avoid drifting from the spec structure.
- HTML in Markdown is acceptable where needed (markdownlint MD033 is disabled),
  but prefer standard Markdown for consistency.

## Testing Guidelines

No automated tests are defined. Validate changes by:
- Reviewing rendered Markdown.
- Checking that cross-references are accurate and up to date.
If you add linting or tests, document the exact command and expected output.

## Commit & Pull Request Guidelines

This copy of the repository does not include Git history, so no commit message
convention can be inferred. If you are committing in an initialized repo, align
with the team standard and keep messages short and imperative.
For pull requests, include a concise summary, note any spec or protocol changes,
and link relevant decisions in `docs/decision-log.md`.

## Documentation Workflow

When updating specs or protocols, keep related documents in sync:
for example, an API change in `docs/api.md` should also be reflected in
`docs/spec.md` and `docs/ws-protocol.md` if applicable.

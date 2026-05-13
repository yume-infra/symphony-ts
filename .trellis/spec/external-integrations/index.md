# External Integrations Guidelines

> Boundaries for tracker, Codex app-server, prompt rendering, and optional tools.

## Scope

Read this layer before changing Linear access, Codex app-server protocol handling, prompt rendering,
or client-side tool exposure.

## Pre-Development Checklist

- [ ] Identify whether the change is tracker, agent protocol, prompt, or tool surface.
- [ ] Check `SPEC.md` sections 10, 11, and 12.
- [ ] Use current external protocol docs or generated schemas when protocol shape matters.
- [ ] Keep orchestrator business logic separate from integration transport details.

## Quality Check

- [ ] External failures map to typed errors.
- [ ] Raw tokens are not exposed to coding agents unless explicitly intended.
- [ ] Codex protocol assumptions are validated against current schema/docs.
- [ ] Prompt rendering uses strict variable/filter semantics.

## Guides

| Guide | Purpose |
| --- | --- |
| [Linear Tracker](./linear-tracker.md) | Linear GraphQL adapter and normalization. |
| [Codex App Server](./codex-app-server.md) | Coding-agent protocol boundary. |
| [Prompt And Context](./prompt-and-context.md) | Prompt template rendering and retry inputs. |
| [Client Tools](./client-tools.md) | Optional tools exposed to coding-agent sessions. |

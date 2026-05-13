# Quality Operations Guidelines

> Verification, logging, safety, AI infrastructure, and future `/goal` usage.

## Scope

Read this layer before changing validation gates, logs, safety checks, AI agent infrastructure, or
automation context.

## Pre-Development Checklist

- [ ] Confirm the change preserves workspace and subprocess safety.
- [ ] Confirm required logs include stable identifiers.
- [ ] Check whether the change affects future AI infrastructure or `/goal` context.
- [ ] Run the appropriate validation commands before reporting completion.

## Quality Check

- [ ] `pnpm verify` passes.
- [ ] Logs are operator-visible and redact secrets.
- [ ] Safety invariants are tested or enforced at boundaries.
- [ ] AI infrastructure assumptions are documented and not copied blindly from another project.

## Guides

| Guide | Purpose |
| --- | --- |
| [Verification](./verification.md) | Project checks and command expectations. |
| [Logging Observability](./logging-observability.md) | Structured logs, metrics, debugging keys. |
| [Safety Invariants](./safety-invariants.md) | Non-negotiable runtime safety rules. |
| [AI Infrastructure](./ai-infrastructure.md) | Codex/Trellis skills and agent workflow direction. |
| [Goal Context](./goal-context.md) | How future `/goal` runs should consume context. |

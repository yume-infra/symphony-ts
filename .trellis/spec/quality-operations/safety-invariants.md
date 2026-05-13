# Safety Invariants

## Workspace Safety

- Per-issue workspace paths must be inside workspace root.
- Workspace keys must be sanitized.
- Coding-agent subprocesses must launch only from the issue workspace.
- Workspace hooks must run with workspace cwd.
- Terminal cleanup must not remove paths outside workspace root.

## Secret Safety

- Do not expose raw Linear tokens to coding-agent prompts.
- Prefer configured tool surfaces over shell helpers for authenticated tracker operations.
- Redact secrets in logs and errors.

## Process Safety

- Subprocesses must be scoped and interruptible.
- User input and approval requests must not stall a run indefinitely.
- Unsupported tool calls must fail structurally and let the session continue or fail according to
  policy.

## Review Priority

During review, prioritize:

1. workspace containment
2. subprocess cwd and cleanup
3. duplicate dispatch prevention
4. retry/stall loops
5. secret exposure
6. missing operator-visible errors

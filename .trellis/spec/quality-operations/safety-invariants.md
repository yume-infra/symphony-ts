# Safety Invariants

## Safety Posture

First-pass conformance must document the intended trust boundary and the approval/sandbox/operator
confirmation posture for coding-agent sessions. Do not leave these as implicit runtime defaults.

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
- Validate secret presence without printing secret values.

## Process Safety

- Subprocesses must be scoped and interruptible.
- User input and approval requests must not stall a run indefinitely.
- Unsupported tool calls must fail structurally and let the session continue or fail according to
  policy.
- Hook output should be truncated in logs.
- Hook timeouts are required to prevent orchestrator hangs.

## Harness Hardening

Document recommended deployment hardening separately from program-enforced guarantees. Examples
include dedicated OS users, workspace-root permission restrictions, dedicated volumes, tighter Codex
approval/sandbox settings, network restrictions, and narrower tracker/tool scopes.

## Review Priority

During review, prioritize:

1. workspace containment
2. subprocess cwd and cleanup
3. duplicate dispatch prevention
4. retry/stall loops
5. secret exposure
6. missing operator-visible errors

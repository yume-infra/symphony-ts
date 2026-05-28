# Decide terminal draining semantics

## Goal

Resolve the product and runtime semantics for a running worker when Linear reports the issue has
entered a terminal state.

## Problem

`SPEC.md` says active-run reconciliation should terminate a worker and clean the workspace when the
tracker state becomes terminal. The current implementation intentionally waits for the worker to
return before cleanup so `after_run`, final answer, and acceptance evidence are preserved.

Both behaviors are defensible:

- immediate termination is safer when an operator marks an issue terminal to stop work;
- graceful draining is safer when the agent itself marks the issue terminal as part of normal
  completion and still needs to write evidence.

The project needs an explicit decision before changing code or relying on accidental behavior.

## Current Alignment

Use three exit models instead of treating every terminal observation as the same stop signal. Code
and JSON names should stay aligned with Linear/runtime wording:

- `completed`: business result, for example Linear state type `completed`. If a running agent marks
  the issue complete, the
  current turn should drain gracefully so Symphony can preserve the final answer, `after_run`,
  run-summary artifacts, and acceptance evidence before cleanup.
- `canceled`: tracker/operator stop intent, for example Linear state type `canceled`. If the tracker
  reflects an operator stop decision, Symphony should interrupt the worker immediately, then preserve
  partial summaries, hook results, and workspace evidence best-effort.
- `terminated`: explicit control-plane kill, for example a future `symphony kill SAY-8`. This is not
  a business tracker state. It is an immediate runtime stop command independent of Linear state,
  with partial evidence preservation best-effort.

Decision sentence:

Symphony 将 tracker 的终态视为生命周期策略，而不是统一的停止行为：表示完成的终态会让当前 turn 优雅收尾以保留证据，表示取消的终态会立即终止 worker 并产出部分证据；后续还应提供显式 kill 入口，避免把操作员的停止意图和业务完成状态混在一起。

Adopt Linear's state type naming directly for tracker classification:

- Linear `completed` means `completed`.
- Linear `canceled` means `canceled`.
- Do not introduce a separate conversion layer for Linear state type names.

Do not model a separate `exitHealth` enum. Effect execution already represents whether a path
finished successfully, failed with a typed error, died with a defect, or was interrupted:

- Effect failure: expected operational/domain errors should be represented as typed `Effect` errors
  and summarized as failures with retry or remediation context.
- Effect defect: unexpected exceptions, bugs, or impossible states should be captured as defects
  (`Cause.die` / die cause) and summarized separately from typed failures.
- Effect interruption: controlled `canceled` and `terminated` paths should be represented as
  interruption where possible. Interruption is control flow, not automatically a typed failure.

## Requirements

- Document the current implementation and the original spec expectation.
- Evaluate at least three policies:
  - immediate termination on any terminal refresh;
  - wait for worker natural completion;
  - terminal-draining with a grace window.
- Decide and document the built-in Linear state type behavior for `completed` and `canceled`.
- Define expected ordering for `after_run`, `before_remove`, partial summaries, and workspace
  cleanup.
- Make terminal cleanup ordering an implementation invariant:
  `capture Effect Exit/Cause -> write run evidence -> record after_run outcome -> before_remove -> remove workspace`.
  If evidence writing fails, skip workspace removal and preserve the workspace for investigation.
- Define the `completed` drain timeout as 90 seconds before a stuck drain escalates to `terminated`.
- Define the explicit `terminated` path in the ADR/spec, but keep the `symphony kill` command itself
  as a separate implementation task unless explicitly pulled forward.
- Define how run summaries report Effect success, typed failure, defect, and interruption causes
  without adding a separate health model.
- Add Linear state type as the primary tracker signal: `Issue.stateType` should carry Linear
  `backlog | unstarted | started | completed | canceled | null`, with Linear GraphQL fetching
  `state { name type }`. Workflow `terminal_states` remains compatibility for state-name or
  non-Linear fallback only.
- Define worker fiber ownership before implementing `canceled` or `terminated`: running worker
  control may keep a `Fiber.RuntimeFiber` or equivalent internal handle, but snapshots expose only
  serializable derived state.
- Update ADR/spec/goal docs to remove ambiguity.
- If implementation changes are chosen, scope them separately from the decision artifact.

## Constraints

- Do not lose run evidence in the normal agent-completes-issue path.
- Do not let external operator stop signals wait forever.
- Keep the model compatible with current high-trust Codex app-server execution.
- Avoid introducing durable persistence as part of this decision task.
- Preserve partial evidence before workspace cleanup where possible. If evidence preservation fails
  after `canceled` or `terminated`, prefer keeping the workspace for investigation over deleting the
  only local context.

## Acceptance Criteria

- [ ] An ADR or equivalent spec decision states the chosen terminal-running policy.
- [ ] The decision explains how it affects SAY-8 style completion.
- [ ] The decision explains how it affects external operator terminal changes.
- [ ] The decision names `completed`, `canceled`, and `terminated` as separate exit models.
- [ ] Built-in Linear state type behavior is documented without a Linear-name conversion layer.
- [ ] Effect success, typed failure, defect, and interruption are reported distinctly without a
      separate `exitHealth` enum.
- [ ] `completed` uses a 90 second drain timeout before escalation.
- [ ] Evidence-before-cleanup ordering is documented, including workspace preservation when evidence
      writing fails.
- [ ] Linear `stateType` is identified as the primary source for `completed` / `canceled`.
- [ ] Running worker interruption has an owned fiber/control-handle design before code changes.
- [ ] Required code changes, if any, are listed as follow-up checklist items.
- [ ] Tests needed for the chosen policy are identified before implementation starts.

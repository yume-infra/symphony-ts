# Execution observability and orchestration assets lead

## Goal

Coordinate the next Symphony-ts observability and orchestration work so the project moves from
"the daemon technically ran" to durable, inspectable run evidence and clear runtime semantics.

This is a lead task. Its job is to keep the child tasks ordered, compatible, and grounded in the
original `SPEC.md` without mixing implementation concerns into one broad change.

## Child Task Order

1. `05-28-agent-run-summary-artifacts`
   - Build the missing post-run assets first. This directly fixes the current operator pain: after a
     task is dispatched, it is hard to see what the agent actually did.
2. `05-28-terminal-draining-semantics`
   - Decide and document how Symphony handles a running worker when the tracker state becomes
     terminal. This should be an ADR/spec decision before broad behavior changes.
3. `05-28-runtime-status-snapshot-surface`
   - Expose current live runtime state only after run-summary artifacts define the shape of
     per-run evidence.
4. `05-28-real-integration-harness-assets`
   - Standardize real Linear/Codex acceptance workflows after summaries and terminal semantics are
     durable enough to reuse.

## Requirements

- Keep child tasks independently executable and reviewable.
- Preserve the current thin CLI shape unless a child task explicitly justifies a small command.
- Treat `SPEC.md` as the product reference and `.trellis/spec/` as local implementation authority.
- Keep Symphony-captured protocol/runtime evidence available, but expose redacted summaries for
  normal operator consumption.
- Do not make the runtime depend on humanized strings; summaries and status surfaces are
  observability products.
- Do not introduce persistence or tracker-write expansion in this lead task. Those remain deferred.
- Align terminal-running behavior around three exit models, using Linear/runtime naming directly:
  - `completed`: business result; the current turn drains gracefully to preserve final answer,
    `after_run`, summary artifacts, and acceptance evidence before cleanup.
  - `canceled`: tracker/operator stop intent; the worker is interrupted immediately, then Symphony
    preserves partial evidence best-effort.
  - `terminated`: explicit control-plane kill, for example a future `symphony kill`; the worker is
    stopped immediately independent of tracker state, with partial evidence preservation
    best-effort.

## Acceptance Criteria

- [ ] All child tasks have clear PRDs and dependencies.
- [ ] Child task ordering is documented and can be followed by future agents.
- [ ] The first child task can start without needing unresolved decisions from later child tasks.
- [ ] Any spec/ADR decision needed before implementation is explicitly assigned to a child task.
- [ ] The lead task can be archived when all child tasks are complete or intentionally deferred.

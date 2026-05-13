# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across runtime and integration boundaries before
> implementing.

## The Problem

Most Symphony-ts bugs will happen at boundaries:

- workflow config parses successfully but typed config applies the wrong default
- tracker payload normalization drops fields the orchestrator needs
- orchestrator starts a worker with stale issue state
- workspace manager returns a path outside the configured root
- agent runner launches Codex from the wrong cwd
- logs omit the identifier needed to debug a stuck run

## Before Implementing Cross-Layer Features

### Step 1: Map The Flow

For Symphony-ts, most flows look like:

```text
WORKFLOW.md -> typed config -> orchestrator -> worker -> workspace -> agent runner -> logs
Linear -> normalized issue -> orchestrator -> prompt -> Codex app-server
```

For each arrow, ask:

- What is the exact input type?
- What is the exact output type?
- What validation happens at this boundary?
- What typed errors can cross the boundary?
- What identifiers must be logged?

### Step 2: Identify Boundaries

| Boundary | Common Issues |
| --- | --- |
| Workflow file -> typed config | missing defaults, unsafe env resolution, invalid reload behavior |
| Linear payload -> normalized issue | missing fields, label case, blocker relation direction |
| Orchestrator -> worker | duplicate claims, stale issue snapshots, lost cancellation |
| Workspace manager -> agent runner | unsafe cwd, path traversal, missing hook failure semantics |
| Codex app-server -> orchestrator | protocol drift, unhandled user input, token totals double-counted |
| Runtime -> logs/status | missing issue/session IDs, large payloads, secret exposure |

### Step 3: Define Contracts

For each boundary, record:

- input shape
- output shape
- validation rules
- error categories
- retry/cancellation behavior
- required logs or metrics

## Common Mistakes

### Mistake 1: Implicit Format Assumptions

Bad: assuming Linear timestamps, priorities, or blocker relations already match the domain model.

Good: normalize once at the tracker boundary and test the exact conversion.

### Mistake 2: Scattered Validation

Bad: checking workspace containment in several call sites but not at the subprocess launch boundary.

Good: validate at the workspace manager and again before launching Codex.

### Mistake 3: Hidden State Mutation

Bad: worker code directly mutates orchestrator state while running.

Good: workers emit events/results and the orchestrator remains the single state authority.

### Mistake 4: Protocol Guessing

Bad: hardcoding Codex app-server message shapes from memory.

Good: check the targeted protocol docs/schema and keep protocol handling isolated.

## Checklist

Before implementation:

- [ ] Mapped the complete runtime flow.
- [ ] Identified every external boundary.
- [ ] Defined validation and error categories at each boundary.
- [ ] Decided where cancellation and retry are owned.
- [ ] Identified required log identifiers.

After implementation:

- [ ] Tested normal and failure paths at each boundary.
- [ ] Verified workspace and subprocess safety invariants.
- [ ] Verified errors are operator-visible.
- [ ] Checked no data needed by later layers is dropped during normalization.

## When To Create Flow Documentation

Create task-specific flow docs when:

- a feature spans three or more layers
- an external protocol is involved
- retry/cancellation behavior is non-trivial
- a safety invariant depends on multiple modules
- a bug exposed a hidden assumption between layers

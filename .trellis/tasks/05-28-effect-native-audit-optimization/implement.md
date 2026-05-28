# Implementation Plan

## Setup

- [x] Verify `repos/effect/` provenance with `pnpm effect:source:verify`.
- [x] Confirm package Effect versions from `package.json` and `pnpm-lock.yaml`.
- [x] Build an Effect code inventory from maintained source and test files.

## Audit Harness

- [x] Add a task-local audit matrix under `research/`.
- [x] Add a reusable module review checklist sourced from vendored Effect practice docs.
- [x] Link any new durable project docs or ADRs from the audit matrix.

## First Runtime Pass

- [x] Select the highest-risk runtime flow from the inventory.
- [x] Read its relevant Trellis specs and upstream Effect examples.
- [x] Compare current implementation against the checklist.
- [x] Implement only scoped, evidence-backed improvements.
- [x] Add or adjust tests when the practice change affects behavior or contracts.

## Documentation Pass

- [x] Add or update the smallest durable guide/spec/ADR needed to preserve the learned convention.
- [x] Record exceptions and deferred modules in the audit matrix.

## Verification

- [x] Run `pnpm effect:source:verify`.
- [x] Run package typecheck through `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`.
- [x] Run relevant tests or `pnpm verify` when scope warrants it.
- [x] Update the task journal or audit matrix with command evidence and next queue.

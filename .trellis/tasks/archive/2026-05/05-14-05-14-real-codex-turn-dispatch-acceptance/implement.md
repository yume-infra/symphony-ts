# Implementation Plan

## Checkpoint 1: Setup

- [x] Create Trellis task.
- [x] Record PRD and design.
- [x] Start task.
- [x] Build CLI before running acceptance.

## Checkpoint 2: Real Dispatch Acceptance

- [x] Query Linear test project and select a real example issue.
- [x] Create temporary workflow and workspace root.
- [x] Launch built `symphony-ts` with real Linear auth and real `codex app-server`.
- [x] Wait for `.symphony-after-run` marker or timeout.
- [x] Stop the long-running service with SIGINT.
- [x] Persist evidence JSON under this task directory.

## Checkpoint 3: Audit

- [x] Verify evidence covers every acceptance criterion.
- [x] Confirm no raw Linear API key appears in task artifacts.
- [x] Record final result in the task.

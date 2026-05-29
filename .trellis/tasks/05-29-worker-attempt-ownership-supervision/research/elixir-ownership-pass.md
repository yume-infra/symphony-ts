# Elixir Ownership & Supervision Pass (TS Task Crosswalk)

Date: 2026-05-29

## 1) Elixir mechanisms observed

- Worker lifecycle start is in `SymphonyElixir.Orchestrator` and launched under `Task.Supervisor`: `Task.Supervisor.start_child(SymphonyElixir.TaskSupervisor, fn -> AgentRunner.run(...) end)` in `do_dispatch_issue` (`orchestrator.ex:694-697`), with host selection done before spawn (`orchestrator.ex:683-690`).
- Orchestrator tracks child identity via `{pid, ref}` in `state.running` at `orchestrator.ex:703-724`.
- A :DOWN monitor is created with `Process.monitor(pid)` (`orchestrator.ex:698`) and observed in `handle_info({:DOWN, ref, :process, _pid, reason}, ...)` (`orchestrator.ex:120-164`).
- Exit mapping is immediate and effectful:
  - `:normal` leads to completion mark and continuation retry (`orchestrator.ex:137-144`);
  - any other reason leads to retry scheduling (`orchestrator.ex:146-157`).
- Worker termination is centralized in `terminate_running_issue`:
  - removes runtime record, optionally calls `terminate_task/1` and `Process.demonitor/2` (`orchestrator.ex:415-435`);
  - `terminate_task/1` uses `Task.Supervisor.terminate_child/2` with `Process.exit(pid, :shutdown)` fallback (`orchestrator.ex:507-517`).
- Reconciliation is currently two-step and runs stale first (`reconcile_stalled_running_issues/1` in `orchestrator.ex:275-276`) then tracker state refresh (`orchestrator.ex:282-291`) and per-issue dispatch (`orchestrator.ex:347-366`), and then missing-id cleanup (`orchestrator.ex:371-388`).
  - terminal branch sets `cleanup_workspace=true` (`orchestrator.ex:349-353`);
  - non-active/blocked branches call `terminate_running_issue(..., false)` (`orchestrator.ex:354-365`).
- Retry is timer-based with token fencing:
  - `schedule_issue_retry/4` stores `retry_token = make_ref()` and `Process.send_after(self(), {:retry_issue, issue_id, retry_token}, delay_ms)` (`orchestrator.ex:773-790`);
  - message is consumed only if token matches in `pop_retry_attempt_state/3` (`orchestrator.ex:812-826`).
- Startup terminal cleanup remains active independently of worker exits: `run_terminal_workspace_cleanup/0` (`orchestrator.ex:882-897`).
- `AgentRunner` owns per-run workspace lifecycle:
  - creates workspace with `Workspace.create_for_issue/2`, runs hooks in `try/after` and calls `Workspace.run_after_run_hook/3` in `after` (`agent_runner.ex:32-42`);
  - sends runtime info (`:worker_runtime_info`) and codex events (`:codex_worker_update`) back to orchestrator recipient with only `issue_id` (`agent_runner.ex:34-58`, `63-77`);
  - orchestrator owns host selection/retry (`agent_runner.ex:14-16`) but the attempt can continue across turns via workspace reuse (`agent_runner.ex:92-121`).

## 2) What maps directly to current TS Effect design

- `runtime.ts` already has the full “supervision event observation” path via `Fiber.forkChild` + `Fiber.await` watcher in `dispatchIssue` (`runtime.ts:495-506`) and centralized interruption with `Fiber.interrupt` (`runtime.ts:73-84`).
- Effect state already tracks run ownership (`attemptId` + optional `workerFiber`) in `RuntimeRunningIssue` (`state.ts:28-31`) and checks fencing in mutations via `runningAttemptMatches(...)` (`state.ts:470-473`).
- `recordCodexEvent` is already owner-aware (`state.ts:69`, `357-367`) and exit handling is routed through state transition helpers (`state.ts:127-128`, `300-355`).
- Retry scheduling and due checks already exist as `RetryEntry` + `dueAtMs` (`state.ts:36`, `279-297`, `528-538`), and startup cleanup with cleanup-hold awareness already exists (`runtime.ts:603-657`, `174-212`, `251-259`).
- Evidence-first behavior is already implemented: `dispatchIssue` collects worker exit as `Exit`, writes evidence first via `evidence.writeAttempt(...)`, then executes cleanup/retry transitions based on `evidenceWritten` + exit (`runtime.ts:402-419`, `422-487`, `214-270`, `272-333`).

## 3) What does not map 1:1 (TS-first divergence)

- Elixir monitors and route updates without an attempt token in events (`:codex_worker_update`, `:worker_runtime_info`) can let late messages hit a reused issue key; TS must keep/strengthen owner fencing on these messages to prevent stale mutation.
- TS must preserve cleanup-on-evidence-success invariant; Elixir terminal cleanup is immediate at supervision time (`orchestrator.ex:424-426`) while TS should keep workspace and write cleanup hold on evidence failure (`runtime.ts:242-259`, `301-307`).
- Elixir’s current stale-vs-terminal order is stale-first; TS target requires terminal/non-active to dominate stale (`reconcile_stalled_running_issues` runs first in Elixir) to avoid terminal-close attempts being retried as stalled.

## 4) Concrete recommendations for next pass

1. Keep a dedicated `AttemptOwner` token in TS with:
   - `issueId`, `identifier`, `attempt`, `attemptId`, `workspacePath`, `startedAtMs`, `workerHost`.
   Route every worker event, exit event, evidence event, cleanup command through owner fencing.
2. Split lifecycle ownership into a supervisor service (or equivalent layer) that:
   - starts workers, stores owned fiber in keyed table, awaits exits, and performs deterministic interrupts;
   - remains policy-free (no retry/cleanup/mark-completed decisions).
3. Harden retries with tokens:
   - extend `RetryEntry` with `retryToken` and `timerRef`;
   - only consume due retry when the token still matches.
4. Adjust reconciliation pass to enforce one-pass priorities:
   - terminal refresh (mark/interrupt)
   - non-active refresh (mark/interrupt)
   - stale detection
   and ensure terminal-closing attempts are not treated as stale retries.
5. Keep/fold evidence-first invariant explicitly in terminal paths:
   - stale/terminal late exits from older attempts may still write evidence, but must not mutate running state or cleanup newer ownership.

## 5) Open risks / follow-up questions

- Can cleanup-hold checks be reused as the single source of terminal retry suppression, or should we add an explicit “closing due terminal” marker in state?
- When we move to stricter owner fences, do we gate `WorkerRunner` `on_message` handlers before state lookup, or keep buffering and drop in `finalizeWorkerExit` when owner mismatches?
- Does retry token state need durable persistence across snapshots/restarts, or is in-memory token + timer-ref ownership sufficient for required guarantees?

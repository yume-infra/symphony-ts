# Workflow Config

## Responsibilities

The workflow/config layer owns:

- selecting the workflow file path
- reading `WORKFLOW.md`
- parsing optional YAML front matter
- extracting the prompt body
- applying defaults
- resolving `$VAR_NAME` values only where the spec allows it
- validating dispatch preconditions
- supporting dynamic reload

## File Path Rules

- Explicit runtime path wins.
- If no path is provided, use `./WORKFLOW.md` from the current working directory.
- Relative `workspace.root` values resolve relative to the workflow file directory.
- Normalize effective filesystem paths before use.

## Config Rules

- Unknown top-level keys should be ignored for forward compatibility.
- Environment variables do not globally override YAML values.
- `$VAR_NAME` resolution applies only to fields that explicitly contain `$VAR_NAME`.
- Sensitive values should be represented with redaction-aware data where practical.

## Dynamic Reload

The runtime must detect `WORKFLOW.md` changes and re-apply config for future operations. Invalid
reloads must not crash the service. Keep operating with the last known good config and emit an
operator-visible error.

## Validation Surface

Startup validation failure should fail startup. Per-tick dispatch validation failure should skip
dispatch for that tick while keeping reconciliation active.

Minimum validation:

- workflow file can be read and parsed
- `tracker.kind` is present and supported
- Linear auth is present after `$` resolution
- Linear project slug is present
- `codex.command` is non-empty

## Effect Guidance

- Represent loading/validation failures as typed errors.
- Keep raw parsed config separate from typed effective config.
- Use services/layers for file system, environment, clock, and logger dependencies.

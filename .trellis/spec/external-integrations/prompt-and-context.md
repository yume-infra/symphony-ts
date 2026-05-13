# Prompt And Context

## Prompt Inputs

Prompt rendering receives:

- workflow prompt template
- normalized `issue`
- optional `attempt`

The first run gets the full rendered prompt. Continuation turns inside a live worker should use
continuation guidance rather than the full original prompt.

## Rendering Rules

- Use strict variable checking.
- Use strict filter checking.
- Preserve nested issue arrays/maps for labels and blockers.
- Treat workflow read/parse failures as config errors.
- Treat render failures as run-attempt failures.

## Retry Context

Pass `attempt` so the workflow can distinguish:

- first run
- continuation run after a clean worker exit
- retry after error, timeout, or stall

## Future `/goal` Context

Codex `/goal` implementation runs should receive:

- the active task PRD/design/implement files
- relevant `.trellis/spec/*/index.md` files
- detailed guideline files for touched layers
- `AGENTS.md`
- `SPEC.md` sections relevant to the current implementation slice

Do not rely on chat history for required implementation context.

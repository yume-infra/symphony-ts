# ADR 0010: YAML Front Matter Boundary

## Status

Accepted.

## Context

`WORKFLOW.md` is a Markdown file with optional YAML front matter. The first implementation used a
small hand-written YAML subset parser because the early runtime only needed maps, arrays, scalars,
and block strings.

That parser was not an Effect concern. Effect should own the runtime boundary: reading the workflow
file through `FileSystem.FileSystem`, mapping parser failures into `WorkflowParseError`, and
validating decoded config sections with Schema. YAML syntax itself should be handled by a maintained
YAML parser.

## Decision

Use the `yaml` package as a direct runtime dependency for front matter syntax parsing.

The workflow loader keeps these boundaries:

- split Markdown front matter from prompt body in `parseWorkflowSource`;
- parse front matter with `yaml.parseDocument(...)`;
- reject YAML parser errors as `workflow_parse_error`;
- reject non-map YAML roots as `workflow_front_matter_not_a_map`;
- disallow aliases during JS conversion with `maxAliasCount: 0`;
- continue to validate known config sections with Effect Schema in the config resolver.

## Consequences

- Symphony accepts YAML according to the parser's YAML 1.2 core schema instead of a local subset.
- Duplicate keys and other parser diagnostics now produce typed workflow parse errors.
- Future syntax behavior should be changed through parser options or documented workflow config
  rules, not by reintroducing a custom YAML parser.

## References

- `apps/cli/src/workflow/yaml.ts`
- `apps/cli/src/workflow/loader.ts`
- `apps/cli/src/config/resolve.ts`
- `docs/effect-patterns/schema-boundaries.md`

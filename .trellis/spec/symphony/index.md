# Symphony Project Guidelines

> Product identity, conformance posture, and shared vocabulary for Symphony-ts.

## Scope

Read this layer before changing product behavior, domain models, task prompts, or implementation
scope. This project is a TypeScript/Effect implementation of the Symphony service described in
`SPEC.md`.

## Pre-Development Checklist

- [ ] Read `SPEC.md` sections relevant to the change.
- [ ] Treat `SPEC.md` as the conformance baseline unless a project decision explicitly diverges.
- [ ] Confirm the change fits the minimal command shape: `symphony-ts [workflow-path]`.
- [ ] Keep the product framed as a long-running orchestration service, not a traditional CLI utility
      or frontend/backend app.
- [ ] Record new intentional deviations in `spec-interpretation.md`.

## Quality Check

- [ ] No behavior silently contradicts `SPEC.md`.
- [ ] Project-specific choices are documented as decisions, not hidden in code.
- [ ] Domain names match the vocabulary in `domain-model.md`.
- [ ] The change can be understood by a future `/goal` run without reading chat history.

## Guides

| Guide | Purpose |
| --- | --- |
| [Product Boundaries](./product-boundaries.md) | What Symphony-ts is and is not. |
| [Spec Interpretation](./spec-interpretation.md) | How to use `SPEC.md`, including deviations. |
| [Domain Model](./domain-model.md) | Shared entities, identifiers, and vocabulary. |

## Language

Project specs are written in English so all AI tooling can consume them consistently.

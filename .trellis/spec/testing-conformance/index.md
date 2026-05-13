# Testing Conformance Guidelines

> Validation strategy for Symphony-ts conformance, fakes, integration profiles, and project checks.

## Scope

Read this layer before adding tests, changing validation commands, or deciding whether a feature is
done.

## Pre-Development Checklist

- [ ] Identify which `SPEC.md` section the behavior implements.
- [ ] Decide whether the behavior is core conformance, extension conformance, or real integration.
- [ ] Use Vitest for first-pass conformance tests.
- [ ] Use Effect-first test helpers for running programs and providing layers.
- [ ] Prefer deterministic unit tests for core behavior.
- [ ] Use fakes for Linear and Codex unless the test is explicitly a real integration profile.

## Quality Check

- [ ] Core conformance behavior has deterministic coverage.
- [ ] Tests can run in the monorepo package layout.
- [ ] Real integration tests are explicit and skip clearly when credentials are unavailable.
- [ ] Project validation passes.
- [ ] Test failures point to a specific contract violation.

## First-Pass Test Runner

Vitest is the first-pass test runner. The important convention is Effect-first test structure:
tests should run explicit Effect programs with shared helpers and provide fake layers for external
boundaries.

## Guides

| Guide | Purpose |
| --- | --- |
| [Validation Matrix](./validation-matrix.md) | Required behavior coverage by area. |
| [Fakes And Integration](./fakes-and-integration.md) | Test doubles and real profiles. |

# Testing Conformance Guidelines

> Validation strategy for Symphony-ts conformance, fakes, integration profiles, and project checks.

## Scope

Read this layer before adding tests, changing validation commands, or deciding whether a feature is
done.

## Pre-Development Checklist

- [ ] Identify which `SPEC.md` section the behavior implements.
- [ ] Decide whether the behavior is core conformance, extension conformance, or real integration.
- [ ] Prefer deterministic unit tests for core behavior.
- [ ] Use fakes for Linear and Codex unless the test is explicitly a real integration profile.

## Quality Check

- [ ] Core conformance behavior has deterministic coverage.
- [ ] Real integration tests are explicit and skip clearly when credentials are unavailable.
- [ ] Project validation passes.
- [ ] Test failures point to a specific contract violation.

## Guides

| Guide | Purpose |
| --- | --- |
| [Validation Matrix](./validation-matrix.md) | Required behavior coverage by area. |
| [Fakes And Integration](./fakes-and-integration.md) | Test doubles and real profiles. |

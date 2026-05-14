# Publishing

This repository publishes the CLI package in `apps/cli` as `@sayoriqwq/symphony-ts`.

## One-Time Setup

Add this GitHub repository secret:

```text
NPM_TOKEN
```

The token must be allowed to publish `@sayoriqwq/symphony-ts` to `https://registry.npmjs.org/`.

## Manual Publish

Use the GitHub Actions workflow named `Publish npm package`.

Required inputs:

- `version`: npm version to publish, for example `0.1.0` or `v0.1.0`.
- `npm_tag`: npm dist-tag, usually `latest`.
- `dry_run`: set to `true` to test without publishing.

The workflow updates `apps/cli/package.json` only inside the CI workspace before publishing. It does
not commit the version change back to the repository.

The publish logic lives in `scripts/publish-npm.mjs`; the GitHub workflow only checks out the repo,
installs dependencies, and runs `pnpm publish:npm`.

## Release Publish

Publishing also runs when a GitHub Release is published.

- Release tag `v1.2.3` publishes package version `1.2.3`.
- Normal releases publish with npm tag `latest`.
- Prereleases publish with npm tag `next`.

## Local Checks

Build and inspect the npm tarball locally:

```bash
pnpm pack:npm
```

Publish from a locally versioned package when needed:

```bash
pnpm publish:npm -- --version 0.1.0 --tag latest --dry-run
```

For a real local publish, set `NODE_AUTH_TOKEN` first. GitHub Actions gets that value from the
`NPM_TOKEN` repository secret.

The root package is private. Only `apps/cli` is publishable.

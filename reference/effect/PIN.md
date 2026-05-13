# Effect Pin

Pinned on: 2026-05-13

## Local Versions

Resolved package versions from `pnpm-lock.yaml`:

| Package | Catalog Range | Resolved Version |
| --- | --- | --- |
| `effect` | `^3.21.2` | `3.21.2` |
| `@effect/platform` | `^0.96.1` | `0.96.1` |
| `@effect/platform-node` | `^0.106.0` | `0.106.0` |
| `@effect/cli` | `^0.75.1` | `0.75.1` |
| `@effect/printer` | `^0.49.0` | `0.49.0` |
| `@effect/printer-ansi` | `^0.49.0` | `0.49.0` |
| `@effect/tsgo` | `^0.7.0` | `0.7.0` |
| `@typescript/native-preview` | `7.0.0-dev.20260513.1` | `7.0.0-dev.20260513.1` |

## Upstream Tags

`git ls-remote --tags https://github.com/Effect-TS/effect.git` resolved these
tag commits:

| Tag | Commit |
| --- | --- |
| `effect@3.21.2` | `39c934c1476be389f7469433910fdf30fc4dad82` |
| `@effect/platform@0.96.1` | `39c934c1476be389f7469433910fdf30fc4dad82` |
| `@effect/platform-node@0.106.0` | `6e3782af7ad047bc006e543f2285fc35bcf798d9` |
| `@effect/cli@0.75.1` | `cc0c40a2fe9f726d1966fe05b82dd0cd82248751` |

## Selected Pin

Use `effect@3.21.2` at
`39c934c1476be389f7469433910fdf30fc4dad82`.

This commit is the best alignment point for the current workspace because the
core `effect@3.21.2` package and `@effect/platform@0.96.1` tag resolve to the
same commit. The checkout also contains `@effect/platform-node@0.106.0` and
`@effect/cli@0.75.1` package manifests, matching the workspace lockfile for the
Node runtime and CLI layers.

The selected checkout is for source reading only. Runtime code continues to use
the installed packages resolved by `pnpm-lock.yaml`.

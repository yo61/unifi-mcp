## Decision: Pin every workflow job to `runs-on: ubuntu-26.04`

## Context

All eight jobs across `ci.yaml`, `release.yaml` and `security.yaml` used
`ubuntu-latest`, which on 2026-11-13 still resolves to 24.04 while 26.04 is
available as `ubuntu-26.04`. The image behind `-latest` moves when GitHub
decides, so the runner OS could change under a green build with no diff here.

## Alternatives considered

- Keep `ubuntu-latest` — zero maintenance, but OS upgrades arrive unannounced.
- Pin `ubuntu-24.04` — matches today's `-latest`, but is the older LTS.
- Pin `ubuntu-26.04` — chosen.

## Reasoning

A runner OS change is a toolchain change and should arrive as a reviewed diff,
the same way actions are SHA-pinned. 26.04 is the current LTS.

## Trade-offs accepted

Nothing bumps the label automatically: Dependabot does not manage `runs-on`.
Moving to the next LTS is a manual edit, and a deprecation notice from GitHub is
the only prompt.

## Supersedes: none

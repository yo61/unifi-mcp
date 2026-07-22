## Decision: Pin TypeScript to 6.x and ignore major bumps in Dependabot

Hold `typescript` at the latest 6.x (`6.0.3`) and add a Dependabot `ignore`
rule suppressing `version-update:semver-major` for TypeScript, so grouped npm
updates keep flowing (including TS 6.x patches) without proposing the 7.0 jump.

## Context: {why this came up}

Dependabot PR #18 (grouped npm update) bundled a `typescript` 6.0.3 -> 7.0.2
bump alongside six unrelated minor/patch updates. TypeScript 7.0 is the new
native (Go) compiler port; the surrounding toolchain (ty, oxlint/tsgolint, tsx)
has not yet settled on it. Accepting the whole group would force the major.

## Alternatives considered

- Accept the full group including TS 7.0.2 — risks toolchain breakage now.
- Close PR #18 entirely — loses the six safe updates.
- Use `@dependabot ignore typescript major version` comment — works, but the
  ignore condition lives only in Dependabot's state, invisible in the repo.
- Pin in package.json + declarative `ignore` in dependabot.yaml — chosen.

## Reasoning

Reverting only the TS line keeps the other six updates. The declarative
`ignore` block is version-controlled and self-documenting, and still allows
6.x minor/patch bumps within the existing `npm` group.

## Trade-offs accepted

TS 7 adoption becomes a deliberate future task (remove the ignore rule) rather
than an automatic Dependabot nudge. Someone must remember to revisit.

## Supersedes: none

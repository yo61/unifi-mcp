## Decision: Adopt the yo61 house CI/release process for unifi-mcp

## Context

unifi-mcp had no CI/release automation. The MVP plan deferred it to its own cycle.

## Alternatives considered

- Minimal CI only (lint/test) — rejected; we want the full backportable process.
- Hand-rolled tag-triggered release with NPM_TOKEN — rejected in favour of
  release-please + OIDC (no stored token, provenance).
- pnpm publish — rejected for the publish step; npm CLI is used for OIDC trusted-publishing support.

## Reasoning

Reuse the battle-tested go-udap/jobhound process; develop it here and backport to civi-mcp.

## Trade-offs accepted

More moving parts; several manual setup steps (npm bootstrap, npm trusted publisher,
CLAUDE_CODE_OAUTH_TOKEN).

## Manual setup required (owner Robin)

1. **npm bootstrap (one-time):** npm trusted publishing requires the package to already exist
   before a trusted publisher can be configured. Do a one-time manual `npm publish` of
   `@robinbowes/unifi-mcp` (e.g. the current 0.1.0) using local/token auth to create the
   package, then proceed to step 2.
2. **Trusted publisher config:** on npmjs, add a trusted publisher for `@robinbowes/unifi-mcp` →
   repo `yo61/unifi-mcp`, workflow `release.yml`. The environment must be blank or exactly `npm`
   (the publish job runs in `environment: npm`; a mismatch fails the OIDC claim).
3. **Public repo:** confirm `yo61/unifi-mcp` is public — `npm publish --provenance` requires a
   public repository.
4. Add repo (or org) secret `CLAUDE_CODE_OAUTH_TOKEN` and variable `CLAUDE_REVIEW_ENABLED=true`
   to enable AI review.
5. (When ready) enable branch protection on main requiring the CI `check` statuses.

## Recovery

If the `publish` job flakes after release-please already created the GitHub release and tag,
re-run just the `publish` job — the release and tag already exist, and `prepublishOnly` re-runs
the gate before publishing.

## Supersedes: none

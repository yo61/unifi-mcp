## Decision: Adopt the yo61 house CI/release process for unifi-mcp

## Context: unifi-mcp had no CI/release automation. The MVP plan deferred it to its own cycle.

## Alternatives considered:

- Minimal CI only (lint/test) — rejected; we want the full backportable process.
- Hand-rolled tag-triggered release with NPM_TOKEN — rejected in favour of release-please + OIDC (no stored token, provenance).
- pnpm publish — rejected for the publish step; npm CLI is used for OIDC trusted-publishing support.

## Reasoning: Reuse the battle-tested go-udap/jobhound process; develop it here and backport to civi-mcp.

## Trade-offs accepted: More moving parts; two manual setup steps (npm trusted publisher; CLAUDE_CODE_OAUTH_TOKEN).

## Manual setup required (owner: Robin):

1. npmjs: create a **trusted publisher** for package @robinbowes/unifi-mcp → repo yo61/unifi-mcp, workflow release.yml.
2. Add repo (or org) secret `CLAUDE_CODE_OAUTH_TOKEN` and variable `CLAUDE_REVIEW_ENABLED=true` to enable AI review.
3. (When ready) enable branch protection on main requiring the CI `check` statuses.

## Supersedes: none.

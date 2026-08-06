## Decision: Reach a patched version rather than renew a scanner suppression

When a scanner advisory has no reachable fix, suppress it with a recorded reason
and an expiry. But treat the suppression as a standing obligation to re-check
whether upstream has made a fix reachable, and prefer bumping to a real fix over
renewing the entry. Once a suppression file holds no entries, delete it rather
than leaving it empty.

## Context

The scheduled `Security` workflow failed on five advisories in transitive
dependencies of `@modelcontextprotocol/sdk` (`ip-address`, `fast-uri`, `hono`).
All five had patched versions already satisfying the ranges declared upstream,
so a lockfile refresh cleared them (#34).

A sixth, `GHSA-frvp-7c67-39w9` (`@hono/node-server` serve-static path traversal),
had been suppressed in both `osv-scanner.toml` and `.grype.yaml` since July. The
recorded reason was accurate when written: the fix landed in 2.0.5, no 1.x
backport exists, and the SDK pinned `^1.19.9`, so no patched version was
reachable.

That stopped being true when SDK 1.30.0 widened the pin to
`^1.19.9 || ^2.0.5`. Nothing in this repo changed, and nothing signalled it. The
`ignoreUntil` date of 2026-10-20 would have surfaced it roughly ten weeks late.

## Alternatives considered

- Renew `ignoreUntil` for another quarter — cheapest, but keeps a suppression
  whose stated justification is now false.
- Bump the SDK and keep both suppressions as belt-and-braces — leaves entries
  that would silently mask a future regression of the same advisory.
- Force `@hono/node-server` via `pnpm.overrides` without bumping the SDK —
  works, but pins a resolution the SDK does not declare support for.
- Bump the SDK, move the resolution explicitly, delete both files — chosen.

## Reasoning

A suppression justified by "no fix is reachable from our dependency ranges" is a
claim about someone else's `package.json`. It can become false without any
change here, so the justification decays independently of the expiry date that
is supposed to police it.

Deleting the files rather than emptying them keeps the repo honest about what is
actually suppressed: absent config means nothing is hidden, whereas an empty
config invites a future entry to be added without the reason-and-expiry
discipline the original header described.

Note that widening a semver range does not move an existing resolution.
`pnpm install` after the SDK bump left `@hono/node-server` at 1.19.14, which
still satisfies `^1.19.9`. Reaching the patched major required an explicit
`pnpm update @hono/node-server --depth Infinity`. A bump that only edits
`package.json` is not evidence the tree changed; check the lockfile.

## Trade-offs accepted

The suppression policy documented in the deleted `osv-scanner.toml` header
(state a reason, carry an `ignoreUntil`) now lives only in this record. A future
suppression may be added without that discipline unless someone finds this file.

`@hono/node-server` moves 1.19.14 -> 2.1.0, a major bump of a transitive
dependency, verified only by unit tests and an MCP stdio handshake. `pnpm smoke`
needs live controller credentials and was not run. The package is unreachable at
runtime for a stdio-only server, which bounds the risk but does not eliminate it.

## Supersedes: none

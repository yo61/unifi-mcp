## Decision: Pin advisory floors as scoped `overrides` in `pnpm-workspace.yaml`

When a transitive dependency is raised to clear an advisory, record the floor as
a pnpm override scoped to the major its dependent declares — `fast-uri@^3:
^3.1.7`, not a bare `fast-uri: >=3.1.7` and not a lockfile edit alone.

## Context

Ten open code-scanning alerts, all against `pnpm-lock.yaml`: five distinct
vulnerabilities reported twice each, once by osv-scanner (CVE rule ids) and once
by grype (`GHSA-…-<package>` rule ids).

- `fast-uri` 3.1.6 — `GHSA-qw65-cvwx-89v3` (authority injection via an
  unvalidated port) and `GHSA-58mr-gqgx-xq4g` (host confusion via an unclosed
  bracket), both HIGH, fixed in 3.1.7.
- `ip-address` 10.4.0 — `GHSA-rpw4-54j3-4h4q` (`isLinkLocal()` matches
  `fe80::/64` not `fe80::/10`) and `GHSA-2vr4-cq9g-pvrc` (no classifier for the
  NAT64 range `64:ff9b:1::/48`), both MEDIUM, fixed in 10.5.1.
- `undici` 6.28.0 — `GHSA-3wwx-pv8p-q78v` (WebSocket permessage-deflate
  decompression DoS), MEDIUM, fixed in 6.28.1.

All three are transitive: `fast-uri` via `ajv`, `ip-address` via
`express-rate-limit` <- `@modelcontextprotocol/sdk`, `undici` via
`@apidevtools/json-schema-ref-parser` <- `@readme/openapi-parser`. The direct
`undici` dependency is 8.10.2, which is itself the patched release for the 8.x
branch — reading the alert as "bump our undici" would have changed nothing.

`fast-uri` is the second occurrence of the same failure. The repo raised it to
3.1.7 on 2026-09-05 by lockfile edit; the grouped Dependabot bump in PR #71
re-resolved it to 3.1.6 the following day, because `ajv` asks for `^3.0.1` and
nothing held the floor. `quality/criteria.md` recorded that as benign — 3.1.6
was itself a fix release with no advisories at the time. Three weeks later two
HIGH advisories were published against exactly 3.1.6.

## Alternatives considered

- Lockfile refresh alone, as in PRs #34 and #71 — clears the alerts, but the
  floor is data in a generated file and the next grouped bump may re-resolve
  below it. Already demonstrated twice.
- Bare `>=` overrides (`fast-uri: >=3.1.7`) — tested. The range is authoritative
  and unbounded above, so `undici@^6: >=6.28.1` dropped the 6.x branch entirely
  and resolved `@apidevtools/json-schema-ref-parser` onto the direct 8.10.2, a
  silent major bump of a dependency that declares `^6.28.0`.
- `pnpm.overrides` in `package.json` — the location named in the unadopted
  criterion, and the one every pnpm guide still shows. pnpm 12 does not read it:
  `[WARN] The "pnpm" field in package.json is no longer read by pnpm ... ignored`.
  The install still succeeds, so a floor added there looks applied and is not.
- Scoped caret overrides in `pnpm-workspace.yaml` — chosen.

## Reasoning

A floor has to outlive the resolution it was written against, and a lockfile
entry does not: `pnpm install` may rewrite it whenever any range still admits a
lower version. An override is the only place the constraint survives
re-resolution, which is the property the two `fast-uri` reversions were missing.

Scoping each override to the dependent's declared major (`fast-uri@^3`, not
`fast-uri`) makes it a floor rather than a pin. Inside the major it raises the
lower bound and leaves the upper bound alone; when upstream moves to a new
major, the selector stops matching and the override retires itself instead of
holding the tree back. That is the behaviour a bare `>=` gets backwards — it
constrains nothing above and everything below.

Verified by falsification rather than by inspection: setting the override to
`fast-uri@^3: 3.1.6` resolved the lockfile to 3.1.6 despite `ajv` asking for
`^3.0.1`, which is what establishes that the override — not the upstream range —
decides. osv-scanner and grype both scan clean on the restored tree, and
osv-scanner reports exactly the five vulnerabilities above against `main`.

## Trade-offs accepted

Three standing entries that nothing will retire automatically. Each stays inert
once upstream's own floor passes it, but no scanner reports an override that has
become redundant, so they accumulate until someone reads the file. The scoping
bounds the damage — a stale entry inside a major that no longer exists in the
tree matches nothing.

Overrides are global to the workspace, not per-dependent. `ip-address@^10:
^10.5.1` would raise the floor for any future dependent on the 10.x line, not
only `express-rate-limit`. That is the intent here, but it is a wider claim than
the advisory makes.

`undici` moves 6.28.0 -> 6.29.0 and `ip-address` 10.4.0 -> 10.7.2, both minor
bumps of transitive dependencies verified by unit tests and the two scanners
only. `pnpm smoke` needs live controller credentials and was not run.

## Supersedes: none

Extends `decisions/2026-08-06-fix-over-suppress-advisories.md`, which set the
fix-over-suppress rule but left the durability of a hand-raised floor open.

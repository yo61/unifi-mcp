## Category: Release hygiene

**Criteria:**

- Every workflow action is pinned to a full commit SHA with a version comment (zizmor enforces).
- Conventional-commit types drive the CHANGELOG; no manual version edits.
- Published package has provenance (npm --provenance via OIDC).

**Severity:** blocking

**Source:** release-engineering design 2026-07-05

**Last triggered:** never

## Category: Security

**Criteria:**

- No dependency with a known vuln reachable in pnpm-lock.yaml (osv-scanner).
- No SBOM component with severity >= HIGH (grype).
- Secrets never logged; TLS verification on by default.
- A transitive version raised to clear an advisory is recorded as a scoped
  `overrides` entry in `pnpm-workspace.yaml`, not left to the lockfile alone.
  Promoted from proposed 2026-09-29 after the second `fast-uri` reversion; see
  `decisions/2026-09-29-pin-advisory-floors.md`.
- Each scanner asserts its own coverage before its result is believed. Both
  paths in `security.yaml` carry one: osv-scan requires the lockfile split to be
  lossless and to keep the larger document, sbom-scan requires the SBOM to hold
  at least 80% as many libraries as the lockfile has resolutions. Promoted from
  proposed 2026-09-29.

**Severity:** blocking

**Source:** release-engineering design 2026-07-05

**Last triggered:** 2026-10-09 — three advisories, each reported twice, for six
open code-scanning alerts: `@modelcontextprotocol/sdk` 1.30.1
(`GHSA-6qxp-vccf-f47h`, HIGH, OAuth client may send credentials to a
server-chosen authorization server, fixed in 1.31.0), `proxy-addr` 2.0.7
(`GHSA-jqcg-44mw-7w3h`, CRITICAL, trust-subnet spoofing via IPv4-mapped IPv6,
fixed in 2.0.8, via `express` <- the SDK) and `source-map-js` 1.2.1
(`GHSA-68fv-2mgg-jv7q`, HIGH, event-loop DoS, fixed in 1.2.2, dev-only via
`postcss` <- `vite` <- `vitest`). Both scanners fired on all three. The SDK is
direct and was bumped to 1.32.1; the two transitive fixes were pinned as scoped
overrides per the criterion above, its first application since promotion. The
SDK's OAuth client and `express` are unreachable for a stdio-only server.

Previously 2026-09-29 — five advisories across three transitive
dependencies, each reported twice (osv-scanner by CVE, grype by GHSA), for ten
open code-scanning alerts: `fast-uri` 3.1.6 (`GHSA-qw65-cvwx-89v3`,
`GHSA-58mr-gqgx-xq4g`, both HIGH, fixed in 3.1.7), `ip-address` 10.4.0
(`GHSA-rpw4-54j3-4h4q`, `GHSA-2vr4-cq9g-pvrc`, both MEDIUM, fixed in 10.5.1) and
`undici` 6.28.0 (`GHSA-3wwx-pv8p-q78v`, MEDIUM, fixed in 6.28.1). Both criteria
fired for `fast-uri`; the three MEDIUMs sat below grype's HIGH cutoff and only
osv-scanner reported them, the same fail-open shape as the entry below.

The `fast-uri` pair is a direct consequence of the transience noted in the
2026-09-05 entry: 3.1.7 was reached by lockfile edit and reverted to 3.1.6 by
PR #71 the next day, and 3.1.6 — recorded then as benign — is precisely the
version both HIGH advisories name. Cleared by raising all three and pinning the
floors as scoped overrides in `pnpm-workspace.yaml`, so this cannot silently
revert a third time. The direct `undici` 8.10.2 was already patched and was not
the alert's subject. Unreachable at runtime for a stdio-only server, which
bounds the exposure but does not clear the alert.

Previously 2026-09-11 — three advisories in `hono` 4.13.0, reached via
`@modelcontextprotocol/sdk` both directly and through `@hono/node-server`:
`GHSA-gqvv-2mrq-wpjv` (`toSSG()` path traversal), `GHSA-crvj-82cr-hjcx` (query
parser reads past the URL fragment) and `GHSA-g6gw-c38x-mqfc` (`parseBody()`
memory exhaustion). All MEDIUM, all fixed in 4.13.5. Only the osv-scanner
criterion fired; grype's cutoff is HIGH, so it passed throughout and this
would have gone unseen had osv-scanner been the one to fail open. Cleared by a
lockfile refresh to 4.13.7 — the SDK asks for `^4.11.4`, so no suppression and
no `pnpm.overrides` were needed, per
`decisions/2026-08-06-fix-over-suppress-advisories.md`. Unreachable at runtime
for a stdio-only server, which bounds the exposure but does not clear the alert.
Same transience caveat as the `fast-uri` entry below applies: the floor lives
only in the lockfile.

Previously 2026-09-05 — six advisories in transitive dependencies:
`fast-uri` 3.1.5 (four HIGH, via `ajv` <- `@readme/openapi-parser`) and `qs`
6.15.3 (two MEDIUM, via `express`/`body-parser` <- `@modelcontextprotocol/sdk`).
Both the osv-scanner and grype criteria fired. Cleared by a lockfile refresh to
`fast-uri` 3.1.7 and `qs` 6.16.0 — no suppression needed, per
`decisions/2026-08-06-fix-over-suppress-advisories.md`. That refresh did not
hold: the grouped npm bump in PR #71 re-resolved the lockfile back to `fast-uri`
3.1.6 on 2026-09-06. Not a regression — 3.1.6 is itself the fix release, OSV
reports no advisories against it, and `pnpm audit` is clean — but it shows a
transitive floor written straight into the lockfile is transient. `ajv` asks for
`^3.0.1` and the repo sets no `pnpm.overrides`, and Dependabot's 7-day cooldown
is the likely reason it landed on 3.1.6 (3.1.7 published 2026-09-02, four days
before the PR opened).

Previously 2026-08-06 — scheduled Security run failed on five advisories in
transitive dependencies of `@modelcontextprotocol/sdk` (PRs #34, #36). Both the
osv-scanner and grype criteria fired.

**Tooling gap found 2026-09-07 (not a criterion trigger):** moving
`packageManager` to pnpm 12 turned `pnpm-lock.yaml` into two YAML documents, and
osv-scanner 2.5.1 reads only the first. The scan went from 273 packages to 9 and
still exited 0. No criterion caught this — it surfaced from running the pinned
scanner by hand against both lockfiles, and CI would have reported a clean pass
over almost nothing. `security.yaml` now reduces the lockfile to its dependency
document and asserts the package count before scanning. See
`decisions/2026-09-07-pnpm-12-node-26.md`.

**Proposed criteria (not adopted — need review):**

- A third-party artifact vendored into the repository is fetched from an
  immutable ref and verified against a recorded digest before use. Prompted by
  `scripts/update-spec.mjs`, which tracked a branch with no integrity check
  until 2026-09-29; `spec/integration.bundled.json` is currently the only such
  artifact, so this is a rule for one file until a second appears.
- grype's `severity-cutoff` is `high`, so a MEDIUM advisory can only ever fail
  the build through osv-scanner. That single point of failure has now been
  exercised twice (2026-09-11, 2026-09-29) without incident, but lowering the
  cutoff to `medium` is a policy change with its own noise cost and has not been
  weighed.

Adopted 2026-09-29: the transitive-floor criterion and the scanner-coverage
criterion above. On the first, note the location it was proposed under,
`pnpm.overrides` in `package.json`, is not read by pnpm 12 — it warns and
continues, so a floor written there would have looked applied and done nothing;
the adopted wording names `pnpm-workspace.yaml`. On the second, the grype path
was measured before it was asserted: syft reports 290 libraries against 274
lockfile resolutions, so the assertion records behaviour that already held
rather than fixing a live gap.

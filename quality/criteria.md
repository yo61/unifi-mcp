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

**Severity:** blocking

**Source:** release-engineering design 2026-07-05

**Last triggered:** 2026-09-05 — six advisories in transitive dependencies:
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

- A scanner's coverage is asserted, not assumed: a scan reporting far fewer
  packages than the lockfile holds is a failure, not a pass. Prompted by the
  2026-09-07 tooling gap.
- A transitive version raised by hand is pinned in `pnpm.overrides`, or the
  lockfile edit is recorded as transient. Prompted by the `fast-uri` 3.1.7
  reversion.

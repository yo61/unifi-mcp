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

**Last triggered:** never

## Decision: Pin the vendored OpenAPI mirror to a commit and verify its digest

`scripts/update-spec.mjs` fetches from an immutable commit ref and checks the
bytes against a recorded SHA-256 before parsing them. The `UNIFI_SPEC_SOURCE`
environment override is removed rather than exempted from the check.

## Context

The Last Light security scan of 2026-07-28 (issue #30) recorded a MEDIUM
finding against `scripts/update-spec.mjs:11`: the bundled spec was fetched from
`raw.githubusercontent.com/tmcpro/unifi-network-api/main/openapi/openapi.yaml`
with no integrity check. The finding sat unaddressed while the two open code
scanning alerts were cleared.

`spec/integration.bundled.json` is the layer-3 fallback of `SpecStore` and
defines the MCP tool surface when a live gateway fetch and the local cache both
miss. A change to it changes what tools exist and what arguments they accept.
Tracking `main` meant whatever that repository held at fetch time became that
surface, with no signal that it had moved.

The mirror is dormant — last pushed 2025-09-14, and the repository head is the
same commit that last touched `openapi/openapi.yaml`. Fetching that commit and
running the existing transform reproduces the committed
`spec/integration.bundled.json` byte for byte, so the pin records the state the
repository is already in rather than adopting a new one.

## Alternatives considered

- Keep tracking `main`, add a digest check — the digest would fail on every
  legitimate upstream change with no way to tell that from tampering, because
  the ref itself carries no commitment.
- Pin the ref, no digest — a commit SHA from GitHub is already content-derived,
  so this covers most of the risk. It does not cover the mirror being rewritten
  or the transport being intercepted, and the digest costs three lines.
- Pin and verify, keeping `UNIFI_SPEC_SOURCE` with the check skipped when set —
  leaves an unauthenticated path that reintroduces exactly the finding.
- Pin and verify, requiring a paired `UNIFI_SPEC_SHA256` when the source is
  overridden — configuration for a need nobody has demonstrated.
- Pin, verify, drop the override — chosen.

## Reasoning

A branch name is a pointer, not a commitment. The repository was relying on a
third party not to move `main`, which is the same shape as relying on a
transitive dependency's declared range to hold a floor — the constraint was not
where the decision got made. See
`decisions/2026-09-29-pin-advisory-floors.md`, which fixed the sibling case.

The digest earns its place by making the failure legible. A moved ref and a
rewritten mirror are indistinguishable from a silent content change; the check
turns both into a message naming the expected and actual digests and pointing
at the review the maintainer owes before accepting them. That error message is
also the update path, so no separate flag is needed to move the pin.

`UNIFI_SPEC_SOURCE` had one consumer, no tests, no documentation and no
recorded use. An override that bypasses an integrity check is not a smaller
version of that check; it is the absence of one, available to anything that can
set an environment variable in a maintainer's shell.

The README claimed in two places that `pnpm update-spec` refreshes the spec
"from a live gateway". It never has — the script has only ever read the mirror.
Corrected while the surrounding lines were being touched.

## Trade-offs accepted

Moving to a newer upstream is now a two-step edit — change `SPEC_REF`, run, and
paste the digest the failure reports — where it used to be automatic. That is
the intended cost: the spec defines the tool surface, so adopting a new one
should be a decision someone records, not a side effect of running a script.

Pinning to a dormant mirror means the bundled spec will drift from Ubiquiti's
own as the Network API evolves, and nothing here will report that. It was
already drifting; the pin makes the staleness explicit rather than causing it.
The live-gateway fetch remains layers 1 and 2, so a current controller is
unaffected.

Dropping `UNIFI_SPEC_SOURCE` removes the only way to point the script at a local
file or an alternate mirror. If that need appears, it should return as an
explicit source-plus-digest pair, not a bare URL.

## Supersedes: none

Addresses the MEDIUM finding in issue #30. The HIGH finding in that issue —
gitleaks `generic-api-key` at `spec/integration.bundled.json:1045` — was already
mitigated by the path allowlist in `.gitleaks.toml`; the matched value is the
placeholder `x_mgmt_key` published in the public mirror. Its checkbox was never
ticked, which is why it still reads as open.

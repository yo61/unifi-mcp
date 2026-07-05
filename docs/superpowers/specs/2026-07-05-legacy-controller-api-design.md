# Legacy controller API surface — design

**Date:** 2026-07-05
**Status:** Approved design, pre-implementation
**Related:** Issue #1 (Add legacy controller API as a second surface);
`docs/superpowers/specs/2026-07-04-unifi-mcp-design.md` → "Future work:
legacy controller API"

## Summary

Add the legacy/internal UniFi controller API (`/api/s/{site}/...` and
`/v2/api/site/{site}/...`) as a second **surface** alongside the Local
Integration API (v1). The legacy surface exposes a broad **read-only**
slice of data that the supported v1 API cannot answer — traditional
(non-zone-based) firewall and inter-VLAN rules, and offline/known clients
being the motivating cases.

Unlike v1, the legacy API serves no OpenAPI document and uses cookie/CSRF
session auth instead of `X-API-KEY`. This surface is therefore described
by a **hand-authored descriptor** and driven by a **session-authenticated
client**, registered behind a new surface-registry seam. The four existing
tools are unchanged; they gain surface routing via a `surface:Entity`
prefix on the entity argument.

## Motivation

Found while smoke-testing a live UDM Pro: the v1 Integration API models
the firewall **only** as Zone-Based Firewall. On a controller using the
*traditional* firewall, `getFirewallZones` returns
`Zone Based Firewall is not configured [HTTP 400]`, and classic LAN-IN /
inter-VLAN rules are **not readable** via the supported API. Separately,
the v1 `Clients` surface only lists *connected* clients — offline/known
clients (which the controller GUI shows) live only on the legacy surface.
Both gaps are instances of the same root cause: v1 does not expose this
data, but the legacy surface the GUI itself uses does.

## Decisions

Four decisions were settled during brainstorming:

1. **Scope — broad read-only slice** (~15-20 operations): Clients,
   Firewall, WLANs, Networks, device/port stats, per-client stats,
   port-forward. Larger descriptor, maximum value.
2. **Routing — surface-prefixed entity.** Same four tools. Entity strings
   carry the surface as a prefix (`legacy:Firewall`). Bare names
   (`Firewall`) default to the `integration` surface, so nothing that
   works today breaks. `unifi_list_entities` emits both surfaces'
   entities, prefixed.
3. **Write posture — read-only now, write path plumbed.** The descriptor
   declares only GET operations in this cycle, but the surface respects
   the same `UNIFI_ALLOW_WRITES` gate as integration, so a future cycle
   can add legacy mutations without re-architecture.
4. **Descriptor authoring — descriptor-as-code (approach A).** A
   TypeScript module exports `ResolvedSpec`-shaped objects
   (`EntityOperation[]` + tags) directly. Type-checked against the
   internal contract, no OpenAPI ceremony, no dereferencer needed (a
   hand-written doc has no `$ref`s). The rejected alternative
   (vendored mini-OpenAPI JSON, approach B) buys a single projection path,
   but base-path derivation and auth already diverge per surface, so the
   reuse benefit is small.

## Architecture

### Surface registry (the seam)

Today `cli.ts` wires a single `{ index, client }` pair and passes it to
`buildServer`. This becomes a `Surface` record:

```
Surface = { name: string; index: EntityIndex; client: SurfaceClient }
```

A small `SurfaceRegistry` holds surfaces keyed by name (`integration`,
`legacy`). The four tools resolve `surface:Entity` → registry → that
surface's `index` + `client`. `SurfaceClient` is the shared interface both
`UnifiClient` (v1) and `LegacyClient` implement (`invoke(op, args)` +
`basePath`).

The `integration` surface is always registered (unchanged behaviour). The
`legacy` surface is registered **only when legacy credentials are
configured** — absent creds, the server behaves exactly as today.

### Legacy surface provider

`createLegacySurface(cfg)`:

1. loads the descriptor-as-code module,
2. builds an `EntityIndex` from it (same `EntityIndex`, fed a
   hand-authored `ResolvedSpec` instead of a projected one),
3. constructs a `LegacyClient` bound to the session auth.

### Session auth

`SessionAuth`:

- `POST <base>/api/auth/login` with `{ username, password }`,
- captures the `TOKEN` cookie and `X-CSRF-Token`,
- `LegacyClient` attaches cookie + CSRF header to each request,
- on a `401`, re-logs-in once, then retries; a second failure surfaces a
  clear auth error.

Credentials via env (`UNIFI_LEGACY_USERNAME`, `UNIFI_LEGACY_PASSWORD`),
following the existing `.env` pattern. This is **additive** to
`http/request.ts`: a request may carry either an API key or a session, not
a rewrite of the request path.

### Base paths

Legacy endpoints resolve under two mounts on a UDM:
`/proxy/network/api/s/{site}/...` and `/proxy/network/v2/api/site/{site}/...`.
Each descriptor operation carries its full mount-relative path; the
`LegacyClient` prepends `/proxy/network`. (Contrast v1, whose base path is
derived from the served spec URL — see `unifi-api-base-path-gotcha`.)

**Site identifier differs from v1.** The legacy `{site}` path parameter is
the site *name* / internal reference (e.g. `default`), **not** the v1
`siteId` UUID. On the live UDM Pro the v1 site overview returns
`{ id: "<uuid>", internalReference: "default", name: "Default" }`; legacy
paths use `internalReference`. The descriptor's `{site}` param maps to this
value, so callers pass `default`, not the UUID.

## Scope — the descriptor operations

The exact enumerated list is authored in the descriptor module; the
priority reads (the motivating gaps) are called out first.

**Priority (motivating gaps):**

- `legacy:Firewall` → `listFirewallRules` (`GET /rest/firewallrule`),
  `listFirewallGroups` (`GET /rest/firewallgroup`) — traditional /
  inter-VLAN rules.
- `legacy:Clients` → `listKnownClients` (`GET /rest/user`),
  `getClientsHistory` (`GET /v2/api/site/{site}/clients/history`) —
  offline / known clients.

**Remainder of the broad slice:**

- `legacy:Networks` → `listNetworkConf` (`GET /rest/networkconf`) — VLAN /
  subnet config.
- `legacy:WLANs` → `listWlanConf` (`GET /rest/wlanconf`).
- `legacy:PortForward` → `listPortForward` (`GET /rest/portforward`).
- `legacy:DeviceStats` → device + port stats
  (`GET /stat/device`, `GET /v2/api/site/{site}/device`).
- `legacy:ClientStats` → per-client stats
  (`GET /stat/sta`, `GET /v2/api/site/{site}/client/{mac}/...`).

Final operation IDs and paths are fixed during descriptor authoring
against the live UDM Pro; the list above is the intended coverage, not the
literal final signatures.

## Error handling

- Reuse the existing error-to-result mapping.
- `401` / expired session → one transparent re-login, then a clear auth
  error if it still fails.
- Calling a `legacy:` entity with no creds configured → a "surface not
  configured" error naming the env vars to set.
- Unknown surface prefix → clear error listing registered surfaces.

## Testing

No live-controller dependency in the suite; the injected `fetcher` seam on
the client is reused.

- **Descriptor** — shape / round-trip through `EntityIndex` (every
  operation resolves, tags list correctly, all read-only in this cycle).
- **SessionAuth** — mocked fetcher: login, cookie + CSRF capture,
  `401` → re-login → retry, second-failure error.
- **Routing** — `legacy:` prefix, bare name → integration, unknown
  surface, unknown entity within a surface.
- **Read-only enforcement** — a write op is refused on the legacy surface
  while `UNIFI_ALLOW_WRITES=false` (and in this cycle the descriptor
  declares no writes at all).

## Configuration

| Env var | Purpose |
| --- | --- |
| `UNIFI_LEGACY_USERNAME` | Local controller account for session login |
| `UNIFI_LEGACY_PASSWORD` | Password for that account |

When both are set, the legacy surface registers; otherwise it is silently
absent and only the integration surface is served.

## Risks and assumptions

- **MFA on the local account.** Headless username/password login assumes a
  **dedicated local, read-only, non-MFA account**. If the account requires
  2FA, login fails; a token/MFA login path is out of scope for this cycle
  and would be a follow-up.
- **Firmware drift.** Legacy paths can shift across UniFi OS versions. The
  descriptor is a maintenance surface; read-only status and per-operation
  isolation limit the blast radius of a path change.
- **Undocumented API.** Response shapes are not contractually stable; the
  server passes them through as-is (consistent with v1's pass-through of
  spec-described responses).

## Out of scope

- Legacy write operations (plumbed via the shared `UNIFI_ALLOW_WRITES`
  gate, but no write ops authored this cycle).
- MFA / token-based legacy login.
- Multi-controller support.
- Caching of legacy response data.
- The Cloud Site Manager API (issue #4 — a separate surface, separate
  cycle).

# unifi-mcp — design

**Date:** 2026-07-04
**Status:** Approved design, pre-implementation
**Related:** `civi-mcp` (the pattern being generalised);
`civi-mcp/knowledge/architecture/hypotheses.md` H1 (framework
generalisation hypothesis)

## Summary

A Model Context Protocol server for the UniFi **Local Network Integration
API**, built so the interface is generated at runtime from the API's own
OpenAPI specification. There is **zero per-resource code**: entities,
fields, and operations are derived from the spec, so a firmware update
that adds endpoints is picked up automatically.

This is a deliberate second data point for `civi-mcp`'s H1 ("the
dispatcher + introspection + generic CRUD pattern generalises"). The
finding baked into this design: the pattern generalises **in spirit but
not in mechanism**. CiviCRM offers *runtime* introspection
(`getFields`/`getActions`) and a *uniform query language*; UniFi offers a
*static OpenAPI document* and *per-endpoint* parameters. The dispatcher
shape survives; the metadata source changes from a live call to a parsed
spec, and there is no universal `where` grammar.

## Goals

- Generic, spec-driven tools — no entity/resource modelled in code.
- Discoverability: an MCP client can browse "what's here → what fields →
  what can I do" entirely from the spec.
- Adapt to new endpoints (or a whole new spec version) with no code
  changes — just a fresh spec.
- Read-only v1 (MVP / proof-of-concept).
- **Write-capable by design**: v1 ships read-only, but writes are a
  first-class post-v1 addition, not a re-architecture. Configuring
  devices from AI via the API is the eventual target.

## Non-goals (v1)

- Cloud Site Manager API and legacy `/api/s/{site}` controller API — a
  registration seam is left, but only the Local Integration surface is
  built.

## Future work: legacy controller API

Add support for the legacy/internal controller API (`/api/s/{site}/...` and
`/v2/api/site/{site}/...`) as an additional registered surface, alongside the
Local Integration API.

**Motivation (found while smoke-testing a live UDM Pro):** the official `/v1`
Integration API only models the firewall as **Zone-Based Firewall** (zones +
policies). On a controller using the *traditional* firewall, `getFirewallZones`
returns `Zone Based Firewall is not configured [HTTP 400]`, and there is **no
way to read classic LAN-IN / inter-VLAN firewall rules** through the supported
API — those live only on the legacy `/v2/api` surface. So questions like "what
access exists between VLANs?" cannot be fully answered from the Integration API
alone. The legacy API is also broader (per-client stats, WLAN/firewall config)
but undocumented and unstable.

**Design note:** unlike the Integration API, the legacy API is **not
OpenAPI-described**, so the spec-driven approach does not transplant — this
surface would need either a hand-maintained descriptor or a different
adapter. Its auth differs too (cookie/session vs `X-API-KEY`). Treat it as a
separate surface behind the same registration seam, likely its own
brainstorm → spec cycle.
- Write operations — defined but gated off (`allowWrites: false`).
- Caching of API *response data* (only the spec is cached).
- Multi-controller support.
- The optional Claude Code skill (workflow heuristics + worked examples,
  as in `civi-mcp/skills/civicrm/`) — noted as a fast-follow.

## Why this API surface

UniFi exposes several APIs; they do **not** share one introspection
mechanism (see the H1 finding above). The **Local Network Integration
API** is chosen for v1 because it is the only surface that *serves its own
OpenAPI document at runtime* (`/proxy/network/api-docs/integration.json`),
which makes the spec-driven approach genuinely automatic, and because it
carries the write operations (device configuration) that are the eventual
target.

Validated against the real spec (community "Static Inference Draft"
mirror, OpenAPI 3.1): 32 tags (`Devices`, `Clients`, `Sites`, `Networks`,
`Hotspot Vouchers`, `QoS`, `ACL`, `VPN`, `WireGuard`, `DHCP`, …); ~327
operations; 243 `GET` vs 62 `POST` + 14 `PUT` + 8 `DELETE`. Two facts this
confirms:

- **`tags` are the entity grouping, for free** — no grouping heuristic
  needed; `list_entities` enumerates tags.
- **HTTP method is the write-risk classifier, for free** — read-only v1 is
  a one-line `method === 'GET'` filter; the 84 mutating operations are the
  pre-classified post-v1 write surface.

The gateway self-serves the supported `/v1` subset; the broader
`/v2/api/...` internal endpoints seen in community specs are unofficial
and out of scope.

## Architecture

Spec-as-runtime-truth dispatcher, layered like `civi-mcp`:

```
MCP tools (4, generic)  →  EntityIndex (tags → operations)  →  UnifiClient (ACL)  →  gateway
        ↑                          ↑
   spec-derived schemas      SpecStore (resolve + parse + cache OpenAPI)
```

## Components

Each has one purpose, a defined interface, and is testable in isolation.

### SpecStore

Resolves the OpenAPI document via a **threshold-gated three-source
cascade** and hands the rest of the system a parsed, `$ref`-resolved spec.

Resolution order (records which `source` won, for logging):

1. **Fresh cache** — if a local cached spec exists and its age is under
   the configured freshness threshold, use it and skip the network.
2. **Live fetch** — otherwise fetch from the gateway
   (`GET /proxy/network/api-docs/integration.json`, `X-API-KEY`); on
   success, rewrite the cache and use it.
3. **Fallback** — if the live fetch fails, use the **stale cache** if
   present, else the **bundled spec**. (Stale cache beats bundled: it
   reflects *this* gateway's firmware; the bundled spec is a generic
   snapshot.)

Config: `specFreshnessThreshold` (default 24h), cache location, optional
`specUrl` / `specFile` overrides.

### EntityIndex

Pure transform over the resolved spec (the analog of `civi-mcp`'s
`mapDescribe`, sourced from OpenAPI instead of `getFields`):

- Groups operations by `tag` → "entities".
- Per operation: classifies read (`GET`) vs write (other); captures path
  params, query params (the per-endpoint filter surface), request-body
  schema, and response schema.

### UnifiClient

The Anti-Corruption Layer (like `Civi4Client`) — the only place that knows
UniFi wire details. Holds `baseUrl` + `X-API-KEY`; given an operation and
arguments, binds `{pathParams}` / query / body, issues the HTTP call, and
unwraps the response envelope. Accepts an injected `fetcher` for testing.

### MCP tools (4, generic)

| Tool                   | Purpose                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `unifi_list_entities`  | Tags: name, description, read/write operation counts          |
| `unifi_describe_entity`| Operations under a tag: params, filters, response fields, R/W |
| `unifi_get`            | Invoke a read (`GET`) operation with params                   |
| `unifi_invoke`         | Write path — **defined but gated off in v1**                  |

### Config

Gateway base URL; API key (system keychain / env — never in code);
`specUrl` / `specFile` / `specFreshnessThreshold` overrides;
`allowWrites: false`.

### scripts/update-spec (maintenance)

Small script (plus a scheduled CI job) that pulls the current official
Integration spec and commits it, so each release ships a recent bundled
floor. Keeps layer 3 of the cascade current.

## Data flow

- **Startup:** `SpecStore.resolve()` → `EntityIndex.build()`. Fail fast
  with an actionable message only if *all three* sources fail.
- **"What can I see?"** → `list_entities` returns tags.
- **"Tell me about Devices"** → `describe_entity("Devices")` returns its
  GET operations with per-operation params/filters and response fields —
  honestly surfacing that there is no universal `where` (this is where
  UniFi is poorer than CiviCRM, and `describe` is where we say so).
- **"List devices on site X"** → `get` binds `{siteId}`, calls the
  operation, returns rows.

## Read-only enforcement and the write seam

Defence in depth, enforced in two places:

- `EntityIndex` exposes only `GET` operations to `unifi_get`.
- `UnifiClient` refuses any non-`GET` method while `allowWrites === false`.

Turning writes on post-v1: widen the filter, flip `allowWrites`, and add a
confirmation gate in `unifi_invoke` (operation risk is already known from
the HTTP verb). No re-architecture — this is the payoff of the
spec-driven choice, and the concrete difference from a hand-modelled
server where each write is bespoke code.

## Security: TLS and secrets

UniFi gateways serve a self-signed certificate. The server does **not** disable
TLS verification by default (that would expose the connection to MITM). Instead:

- Default: normal certificate verification.
- `UNIFI_CA_CERT` (path to the controller's cert/CA PEM) → verify against it via a
  scoped `undici` `Agent`. This is the recommended way to trust a self-signed
  UniFi cert — trust *that* cert, not everything.
- `UNIFI_INSECURE_TLS=true` → explicit last-resort opt-in that disables
  verification, with a loud startup warning. Never the default.

The `X-API-KEY` is read from the environment (keychain-backed in packaged
installs) and is never logged.

CI, release automation, and supply-chain scanning are a separate
**release-engineering** effort (its own spec + plan), modelled on the process in
`../go-udap` and `../jobhound` and intended to backport to `civi-mcp`. This spec
covers the server only.

## Error handling

Fail fast, actionable messages (per the project's standards). Distinguish:
auth failure (bad/expired API key), unreachable controller, unknown
entity/operation (list valid ones), upstream 4xx/5xx (surface UniFi's
error body). Reuse `civi-mcp`'s `errors-to-result` MCP mapping pattern.

## Testing

The spec-driven design is testable without a live controller:

- **EntityIndex** — unit tests over a saved spec fixture: tag grouping,
  read/write classification, param/schema extraction.
- **UnifiClient** — inject a `fetcher` (as `Civi4Client` does) to assert
  path/query/body binding and envelope unwrapping.
- **SpecStore** — unit tests over the three-source cascade: fresh cache
  short-circuits the network; live success rewrites cache; stale cache
  beats bundled on fetch failure.
- **One optional integration test** against a real gateway, gated on env
  vars.

Test behaviour, not the spec's contents.

## Stack

TypeScript, matching `civi-mcp` (pnpm, oxlint, oxfmt, vitest, `ty`/tsc).
Chosen so a future "Rule of Three" framework extraction across `civi-mcp`
and `unifi-mcp` is apples-to-apples.

## Relationship to hypothesis H1

This is the second example H1 asked for. It refines rather than confirms:
the dispatcher + generic-tools shape transfers, but the *metadata source*
and *query model* differ enough that a shared framework would need to
abstract "metadata provider" (runtime introspection vs parsed OpenAPI) and
accept that a uniform query grammar is a CiviCRM luxury, not a given. Not
yet the signal to extract a shared library (that is the third example's
job); it *is* the signal to keep the two servers structurally parallel so
the extraction stays cheap later.

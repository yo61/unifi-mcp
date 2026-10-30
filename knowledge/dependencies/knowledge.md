# Dependencies — knowledge

## pnpm resolution

- pnpm 12 ignores the `pnpm` field in `package.json`. It warns, the install
  still succeeds, and an override placed there looks applied but is not.
  Overrides belong in `pnpm-workspace.yaml`.
  (`decisions/2026-09-29-pin-advisory-floors.md`)
- A bare `>=` override is unbounded above: `undici@^6: >=6.28.1` dropped the 6.x
  branch and moved its dependent onto 8.x. A caret scoped to the dependent's
  major (`undici@^6: ^6.28.1`) is a floor that retires itself when upstream
  changes major.
- Widening a range upstream does not move an existing resolution. `pnpm install`
  keeps any locked version that still satisfies the range; reaching the new one
  takes `pnpm update <pkg> --depth Infinity`.
  (`decisions/2026-08-06-fix-over-suppress-advisories.md`)
- A scoped override selector matches a dependent's range by intersection:
  `@hono/node-server@^2` applies to the SDK's `^1.19.9 || ^2.0.5` and replaces the
  whole range, moving 2.1.0 to 2.1.5 on a plain `pnpm install`.
- Grouped Dependabot bumps re-resolve transitives freely: `fast-uri` was raised
  to 3.1.7 by lockfile edit and dropped back to 3.1.6 the next day (PR #71).

## Scanners

- osv-scanner and grype report the same advisory under different rule ids: a CVE
  id from osv-scanner, `GHSA-…-<package>` from grype. A count of alerts is
  not a count of advisories.
- grype's `severity-cutoff` is `high`, so a MEDIUM or LOW advisory can fail the
  build only through osv-scanner.
- Neither scanner sees a library that ships inside the Node runtime. Node's
  global `fetch` runs on its own bundled undici (8.10.0 on Node 26.8.1);
  `src/http/request.ts` imports only `Agent` from the npm package.

## Advisory fixes

- Fixes are often per release branch: undici patched 6.x, 7.x and 8.x
  separately, and vite patched each 8.x minor (8.1.6, 8.2.4, 8.3.3). Take the
  first patched version from the advisory for the branch actually resolved, not
  the lowest one listed.
- The transitives that keep raising alerts reach the tree through
  `@modelcontextprotocol/sdk` (`express`, `body-parser`, `express-rate-limit`,
  `ip-address`, `hono`, `ajv` → `fast-uri`) and `@readme/openapi-parser`
  (`undici` 6.x, `ajv`). Most of the SDK's HTTP stack is unreachable for a
  stdio-only server.

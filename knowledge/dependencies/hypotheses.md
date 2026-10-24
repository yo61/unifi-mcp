# Dependencies — hypotheses

Need more data. Record each test with its date and outcome.

- **Importing `fetch` from `undici` puts the whole request path on the scanned,
  patched package**, so advisories in Node's bundled undici stop applying, and
  the `as unknown as RequestInit` cast in `src/http/request.ts` becomes
  unnecessary. Test: swap the import, drop the cast, run `pnpm typecheck` and
  `pnpm test`, and check that `response.json()` still honours the abort
  signal. Untested.
- **Some override floors are already redundant**, because upstream's own range
  has since passed them. No scanner reports this. Test: for each entry in
  `pnpm-workspace.yaml`, compare the floor with the minimum every dependent
  declares (`pnpm why <pkg>`, then `npm view <dependent> dependencies`).
  Untested.

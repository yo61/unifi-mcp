# unifi-mcp MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only MCP server for the UniFi Local Network Integration API whose four generic tools are generated at runtime from the API's own OpenAPI document — zero per-resource code.

**Architecture:** Spec-as-runtime-truth dispatcher. `SpecStore` resolves the OpenAPI doc via a threshold-gated three-source cascade (fresh cache → live fetch → stale cache/bundled). `EntityIndex` groups operations by OpenAPI `tag` into "entities". `UnifiClient` is an anti-corruption layer that binds an operation's path/query/body and calls the gateway. Four generic MCP tools sit on top.

**Tech Stack:** TypeScript (ESM, Node 22), `@modelcontextprotocol/sdk`, `zod`, `@readme/openapi-parser`, `undici`, `pino`; tooling: pnpm, oxlint, oxfmt, vitest, tsc.

## Global Constraints

- **Node:** `>=22.0.0`; ESM only (`"type": "module"`).
- **Dependencies pinned exact** (no `^`/`~`); install with `pnpm add --save-exact`. Look up current stable versions at install time — do not assume.
- **Tool names:** `unifi_list_entities`, `unifi_describe_entity`, `unifi_get`, `unifi_invoke` (snake_case, `unifi_` prefix).
- **Auth:** UniFi Local Integration API uses the `X-API-KEY` header (key generated in UniFi Network → Settings → Integrations). Never hard-code or log the key.
- **TLS:** UniFi gateways serve a self-signed cert. Default to **normal verification**. Support `UNIFI_CA_CERT` (path to the controller's cert/CA PEM) → verify against it via a scoped `undici` `Agent({ connect: { ca } })`. Support `UNIFI_INSECURE_TLS=true` as an explicit last-resort opt-in that disables verification, with a loud startup `log.warn`. Never default to disabled verification; never use the global `NODE_TLS_REJECT_UNAUTHORIZED`.
- **Read-only v1:** only `GET` operations are exposed to `unifi_get`; `UnifiClient` refuses any non-GET method while `allowWrites === false` (default). `unifi_invoke` exists but is gated off.
- **Spec URL default:** `<baseUrl>/proxy/network/api-docs/integration.json`. Operation base path comes from the spec's `servers[0].url`.
- **Errors:** typed `UnifiError` subclasses; caught at the tool boundary, logged to stderr, returned as `isError` ToolResults. stdout is reserved for JSON-RPC.
- **Code limits:** ≤100 lines/function, ≤5 positional params, 100-char lines, absolute imports only.
- **Commits:** conventional-commit prefixes; end message bodies with the Co-Authored-By trailer. Work stays on branch `feat/spec-driven-core` (never `main`).

---

## File Structure

```
src/
  config.ts                 # env → Config (zod)
  logging.ts                # pino logger (stderr)
  cli.ts                    # entrypoint: wire config → client → server → stdio
  http/
    errors.ts               # UnifiError hierarchy
    request.ts              # X-API-KEY JSON transport w/ self-signed TLS + typed errors
    cache.ts                # PromiseCache (verbatim from civi-mcp)
  spec/
    types.ts                # ResolvedSpec, EntityOperation, EntitySummary, EntityDescribe
    store.ts                # SpecStore: 3-source cascade + OpenAPI deref
    index.ts                # EntityIndex: tags → operations, read/write classify
  unifi/
    client.ts              # UnifiClient: bind + call + unwrap; allowWrites gate
  mcp/
    errors-to-result.ts     # wrapHandler policy seam
    tools.ts                # the 4 tools + ToolResult type
    server.ts               # buildServer: register tools
spec/
  integration.bundled.json  # bundled fallback spec (updated by script)
scripts/
  update-spec.mjs           # refresh bundled spec
test/
  helpers/mock-fetch.ts
  helpers/fixtures/mini-spec.json
  http/request.test.ts
  http/cache.test.ts
  config.test.ts
  spec/store.test.ts
  spec/index.test.ts
  unifi/client.test.ts
  mcp/tools.test.ts
  mcp/server.test.ts
README.md
LICENSE
.env.example
```

> **Out of scope for this plan:** CI, release-please, publishing, supply-chain
> scanning, commitlint, Taskfile, prek, and `decisions/`/`quality/` dirs are the
> **release-engineering** subsystem — its own brainstorm → spec → plan cycle,
> modelled on `../go-udap` and `../jobhound`, and designed to backport to
> `civi-mcp`. This plan delivers a working, locally-verifiable server
> (`pnpm verify` + git hooks), not the release pipeline.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.oxlintrc.json`, `.oxfmt.toml`, `.markdownlint.jsonc`, `.markdownlint-cli2.jsonc`, `.prettierignore`, `.gitignore`, `pnpm-workspace.yaml`, `.pre-commit-config.yaml`, `test/sanity.test.ts`

**Interfaces:**
- Produces: a green `pnpm verify` gate (format:check, lint, typecheck, test) that every later task relies on.

- [ ] **Step 1: Copy tooling config verbatim from civi-mcp**

Copy these files unchanged from `../civi-mcp/`: `.oxfmt.toml`, `.markdownlint.jsonc`, `.markdownlint-cli2.jsonc`, `.prettierignore`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`, `.pre-commit-config.yaml`. Copy `.oxlintrc.json` unchanged. Copy `pnpm-workspace.yaml` unchanged.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "unifi-mcp",
  "version": "0.1.0",
  "description": "Model Context Protocol server for the UniFi Local Network Integration API.",
  "keywords": ["unifi", "ubiquiti", "claude", "mcp", "model-context-protocol", "openapi"],
  "license": "MIT",
  "type": "module",
  "bin": { "unifi-mcp": "./dist/cli.js" },
  "files": ["dist", "spec/integration.bundled.json", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx watch src/cli.ts",
    "start": "node dist/cli.js",
    "lint": "oxlint",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "UNIFI_INTEGRATION=1 vitest run test/integration",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test",
    "update-spec": "node scripts/update-spec.mjs",
    "prepublishOnly": "pnpm verify && pnpm build"
  },
  "engines": { "node": ">=22.0.0" },
  "packageManager": "pnpm@11.5.3"
}
```

- [ ] **Step 3: Install dependencies (pin exact, look up current stable)**

Run:
```bash
pnpm add --save-exact @modelcontextprotocol/sdk zod pino undici @readme/openapi-parser
pnpm add --save-exact -D @types/node oxfmt oxlint tsx typescript vitest @anthropic-ai/mcpb
```
Record the resolved exact versions in `package.json` (no `^`). Expected: `pnpm-lock.yaml` created.

- [ ] **Step 4: Write the sanity test**

`test/sanity.test.ts`:
```ts
import { expect, test } from "vitest";

test("sanity: arithmetic", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run the verify gate**

Run: `pnpm verify`
Expected: format/lint/typecheck clean, 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold unifi-mcp tooling and toolchain

Config copied from civi-mcp; deps pinned exact.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Error hierarchy + PromiseCache + logger

**Files:**
- Create: `src/http/errors.ts`, `src/http/cache.ts`, `src/logging.ts`
- Test: `test/http/cache.test.ts`

**Interfaces:**
- Produces:
  - `class UnifiError extends Error` (ctor `(message, options?: { cause?: unknown })`)
  - `class UnifiAuthError extends UnifiError` (ctor `(message, options?: { status?: number; cause?: unknown })`, readonly `status?`)
  - `class UnifiApiError extends UnifiError` (ctor `(message, options: { operationId: string; status?: number; cause?: unknown })`, readonly `operationId`, readonly `status?`)
  - `class UnifiTransportError extends UnifiError`
  - `class PromiseCache<K, V>` with `getOrLoad(key, loader): Promise<V>`, `invalidate(key)`, `clear()`
  - `createLogger(level): Logger` and `type Logger = pino.Logger`

- [ ] **Step 1: Write `src/http/errors.ts`**

```ts
export class UnifiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnifiError";
  }
}

export class UnifiAuthError extends UnifiError {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "UnifiAuthError";
    if (options?.status !== undefined) this.status = options.status;
  }
}

export class UnifiApiError extends UnifiError {
  readonly operationId: string;
  readonly status?: number;
  constructor(
    message: string,
    options: { operationId: string; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "UnifiApiError";
    this.operationId = options.operationId;
    if (options.status !== undefined) this.status = options.status;
  }
}

export class UnifiTransportError extends UnifiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "UnifiTransportError";
  }
}
```

- [ ] **Step 2: Write `src/http/cache.ts` (verbatim PromiseCache)**

Copy `../civi-mcp/src/civi/cache.ts` unchanged into `src/http/cache.ts`.

- [ ] **Step 3: Write `src/logging.ts`**

```ts
import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: "error" | "warn" | "info" | "debug"): Logger =>
  pino({ level, base: { svc: "unifi-mcp" } }, pino.destination({ dest: 2, sync: false }));
```

- [ ] **Step 4: Write the failing cache test**

`test/http/cache.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import { PromiseCache } from "../../src/http/cache.js";

describe("PromiseCache", () => {
  test("loads once and memoises", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("does not cache a rejected load", async () => {
    const cache = new PromiseCache<string, number>();
    await expect(
      cache.getOrLoad("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", async () => 7)).toBe(7);
  });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm vitest run test/http/cache.test.ts`
Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add error hierarchy, promise cache, logger

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Config

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces:
  - `type Config = { baseUrl: URL; apiKey: string; specUrl: string; specFile?: string; specFreshnessMs: number; cacheDir: string; timeoutMs: number; caCert?: string; insecureTls: boolean; allowWrites: boolean; logLevel: "error"|"warn"|"info"|"debug" }` (`caCert` holds the PEM **contents**, read from the `UNIFI_CA_CERT` path at load time)
  - `loadConfig(env: Record<string, string | undefined>): Config`

- [ ] **Step 1: Write the failing test**

`test/config.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { UNIFI_BASE_URL: "https://192.168.1.1", UNIFI_API_KEY: "key123" };

describe("loadConfig", () => {
  test("applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.baseUrl.host).toBe("192.168.1.1");
    expect(cfg.specUrl).toBe("https://192.168.1.1/proxy/network/api-docs/integration.json");
    expect(cfg.insecureTls).toBe(false);
    expect(cfg.caCert).toBeUndefined();
    expect(cfg.allowWrites).toBe(false);
    expect(cfg.specFreshnessMs).toBe(86_400_000);
  });

  test("insecureTls opt-in requires explicit true", () => {
    expect(loadConfig({ ...base, UNIFI_INSECURE_TLS: "true" }).insecureTls).toBe(true);
    expect(loadConfig({ ...base, UNIFI_INSECURE_TLS: "1" }).insecureTls).toBe(false);
  });

  test("rejects missing api key", () => {
    expect(() => loadConfig({ UNIFI_BASE_URL: "https://x" })).toThrow(/UNIFI_API_KEY/);
  });

  test("rejects invalid base url", () => {
    expect(() => loadConfig({ UNIFI_BASE_URL: "not-a-url", UNIFI_API_KEY: "k" })).toThrow(
      /UNIFI_BASE_URL/,
    );
  });

  test("allowWrites stays false unless explicitly true", () => {
    expect(loadConfig({ ...base, UNIFI_ALLOW_WRITES: "1" }).allowWrites).toBe(false);
    expect(loadConfig({ ...base, UNIFI_ALLOW_WRITES: "true" }).allowWrites).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../src/config.js'`)

Run: `pnpm vitest run test/config.test.ts`

- [ ] **Step 3: Write `src/config.ts`**

```ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const LogLevel = z.enum(["error", "warn", "info", "debug"]);

const positiveInt = (fallback: number) =>
  z
    .string()
    .default(String(fallback))
    .transform((s, ctx) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message: "must be a positive integer" });
        return z.NEVER;
      }
      return n;
    });

const EnvSchema = z.object({
  UNIFI_BASE_URL: z.url({ error: "UNIFI_BASE_URL must be a valid URL" }),
  UNIFI_API_KEY: z.string({ error: "UNIFI_API_KEY is required" }).min(1, "UNIFI_API_KEY must not be empty"),
  UNIFI_SPEC_URL: z.string().optional(),
  UNIFI_SPEC_FILE: z.string().optional(),
  UNIFI_SPEC_FRESHNESS_MS: positiveInt(86_400_000),
  UNIFI_CACHE_DIR: z.string().default(join(homedir(), ".cache", "unifi-mcp")),
  UNIFI_TIMEOUT_MS: positiveInt(30_000),
  UNIFI_CA_CERT: z.string().optional(),
  UNIFI_INSECURE_TLS: z.string().default("false"),
  UNIFI_ALLOW_WRITES: z.string().default("false"),
  UNIFI_LOG_LEVEL: LogLevel.default("error"),
});

export type Config = {
  baseUrl: URL;
  apiKey: string;
  specUrl: string;
  specFile?: string;
  specFreshnessMs: number;
  cacheDir: string;
  timeoutMs: number;
  caCert?: string;
  insecureTls: boolean;
  allowWrites: boolean;
  logLevel: z.infer<typeof LogLevel>;
};

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration — ${message}`);
  }
  const d = parsed.data;
  const baseUrl = new URL(d.UNIFI_BASE_URL);
  return {
    baseUrl,
    apiKey: d.UNIFI_API_KEY,
    specUrl: d.UNIFI_SPEC_URL ?? new URL("/proxy/network/api-docs/integration.json", baseUrl).toString(),
    ...(d.UNIFI_SPEC_FILE !== undefined ? { specFile: d.UNIFI_SPEC_FILE } : {}),
    specFreshnessMs: d.UNIFI_SPEC_FRESHNESS_MS,
    cacheDir: d.UNIFI_CACHE_DIR,
    timeoutMs: d.UNIFI_TIMEOUT_MS,
    ...(d.UNIFI_CA_CERT !== undefined ? { caCert: readFileSync(d.UNIFI_CA_CERT, "utf8") } : {}),
    insecureTls: d.UNIFI_INSECURE_TLS === "true",
    allowWrites: d.UNIFI_ALLOW_WRITES === "true",
    logLevel: d.UNIFI_LOG_LEVEL,
  };
};
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/config.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add config loader with X-API-KEY and read-only defaults

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: HTTP transport (`request`)

**Files:**
- Create: `src/http/request.ts`, `test/helpers/mock-fetch.ts`
- Test: `test/http/request.test.ts`

**Interfaces:**
- Consumes: `UnifiAuthError`, `UnifiApiError`, `UnifiTransportError` (Task 2).
- Produces:
  ```ts
  type RequestInput = {
    url: URL; method: string; apiKey: string; timeoutMs: number;
    insecureTls: boolean; caCert?: string;
    body?: unknown; operationId?: string; fetcher?: typeof fetch;
  };
  request<T>(input: RequestInput): Promise<T>;
  ```
  - `mockFetch(routes: Record<string, unknown>)` — keyed by `"METHOD pathname"`, returns a `vi.fn<typeof fetch>`.

- [ ] **Step 1: Write `test/helpers/mock-fetch.ts`**

```ts
import { vi } from "vitest";

export type RouteMap = Record<string, unknown>; // "GET /v1/sites" -> body

export const mockFetch = (routes: RouteMap) =>
  vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname}`;
    const body = routes[key];
    if (body === undefined) throw new Error(`mockFetch: no route for ${key}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
```

- [ ] **Step 2: Write the failing test**

`test/http/request.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import { UnifiApiError, UnifiAuthError, UnifiTransportError } from "../../src/http/errors.js";
import { request } from "../../src/http/request.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const opts = { apiKey: "k", timeoutMs: 1000, insecureTls: false as const };

describe("request", () => {
  test("sends X-API-KEY and parses JSON", async () => {
    const fetcher = mockFetch({ "GET /v1/sites": { data: [{ id: "s1" }] } });
    const out = await request<{ data: unknown[] }>({
      url: new URL("https://gw/v1/sites"),
      method: "GET",
      fetcher,
      ...opts,
    });
    expect(out.data).toHaveLength(1);
    const headers = (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("k");
  });

  test("maps 401 to UnifiAuthError", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("no", { status: 401 }));
    await expect(
      request({ url: new URL("https://gw/v1/sites"), method: "GET", fetcher, ...opts }),
    ).rejects.toBeInstanceOf(UnifiAuthError);
  });

  test("maps non-ok to UnifiApiError with status", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ message: "bad" }), { status: 400, headers: { "content-type": "application/json" } }),
    );
    await expect(
      request({ url: new URL("https://gw/v1/x"), method: "GET", fetcher, operationId: "getX", ...opts }),
    ).rejects.toMatchObject({ constructor: UnifiApiError, status: 400 });
  });

  test("wraps non-JSON body in UnifiTransportError with snippet", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    await expect(
      request({ url: new URL("https://gw/v1/x"), method: "GET", fetcher, ...opts }),
    ).rejects.toBeInstanceOf(UnifiTransportError);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `pnpm vitest run test/http/request.test.ts`

- [ ] **Step 4: Write `src/http/request.ts`**

```ts
import { Agent } from "undici";
import { UnifiApiError, UnifiAuthError, UnifiTransportError } from "./errors.js";

export type RequestInput = {
  url: URL;
  method: string;
  apiKey: string;
  timeoutMs: number;
  insecureTls: boolean;
  caCert?: string;
  body?: unknown;
  operationId?: string;
  fetcher?: typeof fetch;
};

// Memoise dispatchers so we don't build a new undici Agent per request.
// Default (no CA, not insecure) → undefined → normal TLS verification.
const agents = new Map<string, Agent>();
const dispatcherFor = (insecureTls: boolean, caCert?: string): Agent | undefined => {
  if (!caCert && !insecureTls) return undefined;
  const key = caCert ? `ca:${caCert}` : "insecure";
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent(
      caCert ? { connect: { ca: caCert } } : { connect: { rejectUnauthorized: false } },
    );
    agents.set(key, agent);
  }
  return agent;
};

export const request = async <T>(input: RequestInput): Promise<T> => {
  const { url, method, apiKey, timeoutMs, insecureTls, caCert, body, operationId } = input;
  const fetcher = input.fetcher ?? fetch;
  const opId = operationId ?? `${method} ${url.pathname}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit & { dispatcher?: Agent } = {
    method,
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    signal: controller.signal,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // Only attach a custom dispatcher when using the real fetch (undici).
    // Injected test fetchers receive plain RequestInit.
    ...(input.fetcher ? {} : { dispatcher: dispatcherFor(insecureTls, caCert) }),
  };

  let response: Response;
  try {
    response = await fetcher(url, init as RequestInit);
  } catch (cause) {
    clearTimeout(timer);
    const m = cause instanceof Error ? `HTTP request failed: ${cause.message}` : "HTTP request failed";
    throw new UnifiTransportError(m, { cause });
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    throw new UnifiAuthError(`Authentication failed (${response.status}) — check UNIFI_API_KEY`, {
      status: response.status,
    });
  }

  const peek = response.clone();
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    let snippet = "";
    try {
      snippet = (await peek.text()).slice(0, 200).replace(/\s+/g, " ").trim();
    } catch {
      // clone body unreadable — ignore
    }
    const ct = response.headers.get("content-type") ?? "unknown";
    throw new UnifiTransportError(
      `Response was not valid JSON (content-type: ${ct}).${snippet ? ` body starts with: ${snippet}` : ""}`,
      { cause },
    );
  }

  if (!response.ok) {
    const detail =
      parsed !== null && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : response.statusText;
    throw new UnifiApiError(`${opId} failed: ${detail}`, { operationId: opId, status: response.status });
  }

  return parsed as T;
};
```

Note: the `dispatcher` is only applied when using the real `fetch` (undici). When a test injects `fetcher`, `dispatcher` is omitted so mocks stay simple.

- [ ] **Step 5: Run it — expect PASS**

Run: `pnpm vitest run test/http/request.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add X-API-KEY http transport with self-signed TLS support

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bundled spec + update script + spec types

**Files:**
- Create: `spec/integration.bundled.json`, `scripts/update-spec.mjs`, `src/spec/types.ts`, `test/helpers/fixtures/mini-spec.json`

**Interfaces:**
- Produces:
  ```ts
  type ResolvedSpec = {
    tags: ReadonlyArray<{ name: string; description?: string }>;
    operations: readonly EntityOperation[];
    serverBasePath: string;
  };
  type EntityOperation = {
    operationId: string; tag: string; method: string; path: string; summary?: string;
    read: boolean; pathParams: readonly string[];
    queryParams: ReadonlyArray<{ name: string; required: boolean; description?: string }>;
    requestBodySchema?: unknown; responseSchema?: unknown;
  };
  type EntitySummary = { name: string; description?: string; readOps: number; writeOps: number };
  type EntityDescribe = { entity: string; operations: readonly EntityOperation[] };
  ```

- [ ] **Step 1: Write `src/spec/types.ts`** — the type block above, each as an `export type`.

- [ ] **Step 2: Add the bundled spec**

Download the current official integration spec into `spec/integration.bundled.json`:
```bash
curl -sL "https://raw.githubusercontent.com/tmcpro/unifi-network-api/71bc0572d752a910196ffaeccf561529e26fe607/openapi/openapi.yaml" -o /tmp/unifi-spec.yaml
node -e "const YAML=require('yaml');const fs=require('fs');fs.writeFileSync('spec/integration.bundled.json',JSON.stringify(YAML.parse(fs.readFileSync('/tmp/unifi-spec.yaml','utf8')),null,2))" || true
```
If `yaml` is unavailable, install it dev-only (`pnpm add --save-exact -D yaml`) or hand-convert. The bundled spec is committed as JSON. (Ubiquiti does not publish a canonical static URL; this community mirror is the interim source — see `update-spec.mjs` header.)

- [ ] **Step 3: Write `scripts/update-spec.mjs`**

```js
#!/usr/bin/env node
// Refreshes spec/integration.bundled.json — the layer-3 fallback of SpecStore.
// Source: community OpenAPI mirror (Ubiquiti serves the live spec per-gateway
// at /proxy/network/api-docs/integration.json but publishes no static URL).
import { writeFileSync } from "node:fs";
import YAML from "yaml";

const SRC =
  process.env.UNIFI_SPEC_SOURCE ??
  "https://raw.githubusercontent.com/tmcpro/unifi-network-api/master/openapi/openapi.yaml";

const res = await fetch(SRC);
if (!res.ok) throw new Error(`update-spec: ${res.status} fetching ${SRC}`);
const spec = YAML.parse(await res.text());
writeFileSync("spec/integration.bundled.json", `${JSON.stringify(spec, null, 2)}\n`);
process.stderr.write(`update-spec: wrote ${spec.paths ? Object.keys(spec.paths).length : 0} paths\n`);
```

- [ ] **Step 4: Write `test/helpers/fixtures/mini-spec.json`** — a hand-authored minimal OpenAPI 3.1 doc used by index/store tests:

```json
{
  "openapi": "3.1.0",
  "info": { "title": "Mini", "version": "1.0.0" },
  "servers": [{ "url": "/proxy/network/integration" }],
  "tags": [
    { "name": "Sites", "description": "Sites on this controller" },
    { "name": "Devices", "description": "UniFi devices" }
  ],
  "paths": {
    "/v1/sites": {
      "get": {
        "operationId": "listSites", "tags": ["Sites"], "summary": "List sites",
        "responses": { "200": { "content": { "application/json": { "schema": { "type": "object" } } } } }
      }
    },
    "/v1/sites/{siteId}/devices": {
      "get": {
        "operationId": "listDevices", "tags": ["Devices"], "summary": "List devices",
        "parameters": [
          { "name": "siteId", "in": "path", "required": true, "schema": { "type": "string" } },
          { "name": "limit", "in": "query", "required": false, "schema": { "type": "integer" } }
        ],
        "responses": { "200": { "content": { "application/json": { "schema": { "type": "object" } } } } }
      },
      "post": {
        "operationId": "adoptDevice", "tags": ["Devices"], "summary": "Adopt device",
        "parameters": [{ "name": "siteId", "in": "path", "required": true, "schema": { "type": "string" } }],
        "requestBody": { "content": { "application/json": { "schema": { "type": "object" } } } },
        "responses": { "200": { "content": { "application/json": { "schema": { "type": "object" } } } } }
      }
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add spec types, bundled spec fallback, and update script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: EntityIndex

**Files:**
- Create: `src/spec/index.ts`
- Test: `test/spec/index.test.ts`

**Interfaces:**
- Consumes: `ResolvedSpec`, `EntityOperation`, `EntitySummary`, `EntityDescribe` (Task 5).
- Produces:
  ```ts
  buildResolvedSpec(deref: unknown): ResolvedSpec;   // maps a dereferenced OpenAPI doc → ResolvedSpec
  class EntityIndex {
    constructor(spec: ResolvedSpec);
    listEntities(): readonly EntitySummary[];
    describeEntity(tag: string): EntityDescribe;                 // throws if unknown
    findReadOperation(tag: string, operationId: string): EntityOperation; // throws if unknown/not read
  }
  ```

- [ ] **Step 1: Write the failing test**

`test/spec/index.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";

const index = new EntityIndex(buildResolvedSpec(mini));

describe("EntityIndex", () => {
  test("lists entities from tags with read/write counts", () => {
    const entities = index.listEntities();
    const devices = entities.find((e) => e.name === "Devices");
    expect(devices).toMatchObject({ readOps: 1, writeOps: 1 });
    expect(entities.find((e) => e.name === "Sites")).toMatchObject({ readOps: 1, writeOps: 0 });
  });

  test("describeEntity returns operations with params", () => {
    const d = index.describeEntity("Devices");
    const list = d.operations.find((o) => o.operationId === "listDevices");
    expect(list?.pathParams).toEqual(["siteId"]);
    expect(list?.queryParams.map((q) => q.name)).toContain("limit");
    expect(list?.read).toBe(true);
  });

  test("describeEntity throws on unknown tag", () => {
    expect(() => index.describeEntity("Nope")).toThrow(/unknown entity/i);
  });

  test("findReadOperation refuses a write operation", () => {
    expect(() => index.findReadOperation("Devices", "adoptDevice")).toThrow(/not a read/i);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run test/spec/index.test.ts`

- [ ] **Step 3: Write `src/spec/index.ts`**

```ts
import type {
  EntityDescribe,
  EntityOperation,
  EntitySummary,
  ResolvedSpec,
} from "./types.js";

type RawParam = { name: string; in: string; required?: boolean; description?: string };
type RawOp = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  parameters?: RawParam[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};
type RawDoc = {
  tags?: Array<{ name: string; description?: string }>;
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, RawOp>>;
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

const jsonSchema = (bag?: { content?: Record<string, { schema?: unknown }> }): unknown =>
  bag?.content?.["application/json"]?.schema;

export const buildResolvedSpec = (deref: unknown): ResolvedSpec => {
  const doc = deref as RawDoc;
  const operations: EntityOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Untagged";
      const params = op.parameters ?? [];
      const requestBodySchema = jsonSchema(op.requestBody);
      const responseSchema = jsonSchema(op.responses?.["200"]);
      operations.push({
        operationId: op.operationId ?? `${method.toUpperCase()} ${path}`,
        tag,
        method: method.toUpperCase(),
        path,
        ...(op.summary !== undefined ? { summary: op.summary } : {}),
        read: method === "get",
        pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
        queryParams: params
          .filter((p) => p.in === "query")
          .map((p) => ({
            name: p.name,
            required: p.required === true,
            ...(p.description !== undefined ? { description: p.description } : {}),
          })),
        ...(requestBodySchema !== undefined ? { requestBodySchema } : {}),
        ...(responseSchema !== undefined ? { responseSchema } : {}),
      });
    }
  }
  return {
    tags: (doc.tags ?? []).map((t) => ({
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
    })),
    operations,
    serverBasePath: doc.servers?.[0]?.url ?? "",
  };
};

export class EntityIndex {
  readonly #spec: ResolvedSpec;
  readonly #byTag = new Map<string, EntityOperation[]>();

  constructor(spec: ResolvedSpec) {
    this.#spec = spec;
    // Seed declared tags so a tag with zero operations is still a known
    // entity — listEntities() surfaces it, so describeEntity() must too.
    for (const tag of spec.tags) this.#byTag.set(tag.name, []);
    for (const op of spec.operations) {
      const list = this.#byTag.get(op.tag) ?? [];
      list.push(op);
      this.#byTag.set(op.tag, list);
    }
  }

  listEntities(): readonly EntitySummary[] {
    const declared = new Map(this.#spec.tags.map((t) => [t.name, t.description]));
    const names = new Set<string>([...declared.keys(), ...this.#byTag.keys()]);
    return [...names].sort().map((name) => {
      const ops = this.#byTag.get(name) ?? [];
      const description = declared.get(name);
      return {
        name,
        ...(description !== undefined ? { description } : {}),
        readOps: ops.filter((o) => o.read).length,
        writeOps: ops.filter((o) => !o.read).length,
      };
    });
  }

  describeEntity(tag: string): EntityDescribe {
    const operations = this.#byTag.get(tag);
    if (!operations) throw new Error(`Unknown entity '${tag}'. Call unifi_list_entities first.`);
    return { entity: tag, operations };
  }

  findReadOperation(tag: string, operationId: string): EntityOperation {
    const op = this.describeEntity(tag).operations.find((o) => o.operationId === operationId);
    if (!op) throw new Error(`Unknown operation '${operationId}' on entity '${tag}'.`);
    if (!op.read) throw new Error(`Operation '${operationId}' is not a read (GET) operation.`);
    return op;
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/spec/index.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add EntityIndex mapping OpenAPI tags to entities

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: SpecStore (three-source cascade)

**Files:**
- Create: `src/spec/store.ts`
- Test: `test/spec/store.test.ts`

**Interfaces:**
- Consumes: `request` (Task 4), `buildResolvedSpec` (Task 6), `ResolvedSpec` (Task 5).
- Produces:
  ```ts
  type SpecSource = "fresh-cache" | "live" | "stale-cache" | "bundled";
  type SpecStoreDeps = {
    now(): number;
    readCache(): Promise<{ fetchedAt: number; doc: unknown } | undefined>;
    writeCache(entry: { fetchedAt: number; doc: unknown }): Promise<void>;
    fetchLive(): Promise<unknown>;
    readBundled(): Promise<unknown>;
    dereference(doc: unknown): Promise<unknown>;
  };
  class SpecStore {
    constructor(freshnessMs: number, deps: SpecStoreDeps);
    resolve(): Promise<{ spec: ResolvedSpec; source: SpecSource }>;
  }
  ```
  (Dependencies are injected so the cascade is unit-tested without fs/network/clock.)

- [ ] **Step 1: Write the failing test**

`test/spec/store.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { SpecStore, type SpecStoreDeps } from "../../src/spec/store.js";

const baseDeps = (over: Partial<SpecStoreDeps>): SpecStoreDeps => ({
  now: () => 1_000_000,
  readCache: async () => undefined,
  writeCache: async () => {},
  fetchLive: async () => mini,
  readBundled: async () => mini,
  dereference: async (d) => d,
  ...over,
});

describe("SpecStore cascade", () => {
  test("fresh cache short-circuits the network", async () => {
    const fetchLive = vi.fn(async () => mini);
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 999_500, doc: mini }),
      fetchLive,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("fresh-cache");
    expect(fetchLive).not.toHaveBeenCalled();
  });

  test("stale cache triggers live fetch and rewrites cache", async () => {
    const writeCache = vi.fn(async () => {});
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 100, doc: mini }),
      writeCache,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("live");
    expect(writeCache).toHaveBeenCalledWith({ fetchedAt: 1_000_000, doc: mini });
  });

  test("live failure with stale cache uses stale cache (beats bundled)", async () => {
    const readBundled = vi.fn(async () => mini);
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 100, doc: mini }),
      fetchLive: async () => { throw new Error("unreachable"); },
      readBundled,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("stale-cache");
    expect(readBundled).not.toHaveBeenCalled();
  });

  test("live failure with no cache falls back to bundled", async () => {
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => undefined,
      fetchLive: async () => { throw new Error("unreachable"); },
    }));
    const { source, spec } = await store.resolve();
    expect(source).toBe("bundled");
    expect(spec.tags.map((t) => t.name)).toContain("Devices");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run test/spec/store.test.ts`

- [ ] **Step 3: Write `src/spec/store.ts`**

```ts
import { buildResolvedSpec } from "./index.js";
import type { ResolvedSpec } from "./types.js";

export type SpecSource = "fresh-cache" | "live" | "stale-cache" | "bundled";

export type SpecStoreDeps = {
  now(): number;
  readCache(): Promise<{ fetchedAt: number; doc: unknown } | undefined>;
  writeCache(entry: { fetchedAt: number; doc: unknown }): Promise<void>;
  fetchLive(): Promise<unknown>;
  readBundled(): Promise<unknown>;
  dereference(doc: unknown): Promise<unknown>;
};

export class SpecStore {
  readonly #freshnessMs: number;
  readonly #deps: SpecStoreDeps;

  constructor(freshnessMs: number, deps: SpecStoreDeps) {
    this.#freshnessMs = freshnessMs;
    this.#deps = deps;
  }

  async resolve(): Promise<{ spec: ResolvedSpec; source: SpecSource }> {
    const d = this.#deps;
    const cache = await d.readCache();

    if (cache && d.now() - cache.fetchedAt < this.#freshnessMs) {
      return this.#finish(cache.doc, "fresh-cache");
    }

    try {
      const doc = await d.fetchLive();
      await d.writeCache({ fetchedAt: d.now(), doc });
      return this.#finish(doc, "live");
    } catch {
      if (cache) return this.#finish(cache.doc, "stale-cache");
      return this.#finish(await d.readBundled(), "bundled");
    }
  }

  async #finish(doc: unknown, source: SpecSource): Promise<{ spec: ResolvedSpec; source: SpecSource }> {
    const deref = await this.#deps.dereference(doc);
    return { spec: buildResolvedSpec(deref), source };
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/spec/store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SpecStore three-source cascade

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: SpecStore wiring factory (real fs/network deps)

**Files:**
- Create: `src/spec/factory.ts`
- Test: `test/spec/factory.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 3), `request` (Task 4), `SpecStore`/`SpecStoreDeps` (Task 7).
- Produces: `createSpecStore(cfg: Config): SpecStore` — builds real deps: cache file at `<cacheDir>/integration-spec.json`, live fetch via `request`, bundled read from the packaged `spec/integration.bundled.json`, dereference via `@readme/openapi-parser`.

- [ ] **Step 1: Write the failing test** (verifies the cache file path + bundled resolution, using a temp dir and no network)

`test/spec/factory.test.ts`:
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createSpecStore } from "../../src/spec/factory.js";
import type { Config } from "../../src/config.js";

let dir: string;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

const cfg = (over: Partial<Config>): Config => ({
  baseUrl: new URL("https://127.0.0.1"),
  apiKey: "k",
  specUrl: "https://127.0.0.1/nope.json",
  specFreshnessMs: 1000,
  cacheDir: dir,
  timeoutMs: 200,
  insecureTls: false,
  allowWrites: false,
  logLevel: "error",
  ...over,
});

describe("createSpecStore", () => {
  test("falls back to bundled spec when the gateway is unreachable", async () => {
    dir = mkdtempSync(join(tmpdir(), "unifi-spec-"));
    const store = createSpecStore(cfg({ cacheDir: dir }));
    const { source, spec } = await store.resolve();
    expect(source).toBe("bundled");
    expect(spec.operations.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run test/spec/factory.test.ts`

- [ ] **Step 3: Write `src/spec/factory.ts`**

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dereference as openapiDereference } from "@readme/openapi-parser";
import type { Config } from "../config.js";
import { request } from "../http/request.js";
import { SpecStore, type SpecStoreDeps } from "./store.js";

const BUNDLED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "spec", "integration.bundled.json");

export const createSpecStore = (cfg: Config): SpecStore => {
  const cacheFile = join(cfg.cacheDir, "integration-spec.json");

  const deps: SpecStoreDeps = {
    now: () => Date.now(),
    readCache: async () => {
      try {
        return JSON.parse(await readFile(cacheFile, "utf8")) as { fetchedAt: number; doc: unknown };
      } catch {
        return undefined;
      }
    },
    writeCache: async (entry) => {
      await mkdir(cfg.cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(entry));
    },
    fetchLive: async () =>
      request<unknown>({
        url: new URL(cfg.specUrl),
        method: "GET",
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        insecureTls: cfg.insecureTls,
        ...(cfg.caCert !== undefined ? { caCert: cfg.caCert } : {}),
        operationId: "fetchSpec",
      }),
    readBundled: async () => JSON.parse(await readFile(cfg.specFile ?? BUNDLED, "utf8")),
    dereference: async (doc) => openapiDereference(structuredClone(doc) as never),
  };

  return new SpecStore(cfg.specFreshnessMs, deps);
};
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/spec/factory.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire SpecStore to fs cache, live fetch, and OpenAPI deref

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: UnifiClient (anti-corruption layer)

**Files:**
- Create: `src/unifi/client.ts`
- Test: `test/unifi/client.test.ts`

**Interfaces:**
- Consumes: `EntityOperation`, `ResolvedSpec` (Task 5), `request` (Task 4), `Config` (Task 3).
- Produces:
  ```ts
  type InvokeArgs = { pathParams?: Record<string, string>; query?: Record<string, string>; body?: unknown };
  class UnifiClient {
    constructor(cfg: Config, serverBasePath: string);
    invoke(op: EntityOperation, args: InvokeArgs): Promise<unknown>; // refuses non-GET when !allowWrites
  }
  ```

- [ ] **Step 1: Write the failing test**

`test/unifi/client.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { UnifiClient } from "../../src/unifi/client.js";
import type { EntityOperation } from "../../src/spec/types.js";
import type { Config } from "../../src/config.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const cfg = (over: Partial<Config> = {}): Config => ({
  baseUrl: new URL("https://gw"),
  apiKey: "k", specUrl: "https://gw/s.json", specFreshnessMs: 1, cacheDir: "/tmp",
  timeoutMs: 500, insecureTls: false, allowWrites: false, logLevel: "error", ...over,
});

const listDevices: EntityOperation = {
  operationId: "listDevices", tag: "Devices", method: "GET",
  path: "/v1/sites/{siteId}/devices", read: true, pathParams: ["siteId"],
  queryParams: [{ name: "limit", required: false }],
};
const adopt: EntityOperation = { ...listDevices, operationId: "adopt", method: "POST", read: false };

describe("UnifiClient", () => {
  test("binds path params and query, prefixing the server base path", async () => {
    const fetcher = mockFetch({ "GET /proxy/network/integration/v1/sites/s1/devices": { data: [] } });
    const client = new UnifiClient(cfg(), "/proxy/network/integration", fetcher);
    const out = await client.invoke(listDevices, { pathParams: { siteId: "s1" }, query: { limit: "5" } });
    expect(out).toEqual({ data: [] });
    const calledUrl = new URL(fetcher.mock.calls[0]![0] as string | URL);
    expect(calledUrl.pathname).toBe("/proxy/network/integration/v1/sites/s1/devices");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });

  test("refuses a write operation while allowWrites is false", async () => {
    const client = new UnifiClient(cfg({ allowWrites: false }), "/proxy/network/integration");
    await expect(client.invoke(adopt, { pathParams: { siteId: "s1" } })).rejects.toThrow(/read-only/i);
  });

  test("missing required path param is an actionable error", async () => {
    const client = new UnifiClient(cfg(), "/proxy/network/integration");
    await expect(client.invoke(listDevices, {})).rejects.toThrow(/siteId/);
  });
});
```
(Inject the fetcher by passing it through config-independent `request`; the client accepts an optional `fetcher` param — see impl.)

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run test/unifi/client.test.ts`

- [ ] **Step 3: Write `src/unifi/client.ts`**

```ts
import type { Config } from "../config.js";
import { request } from "../http/request.js";
import type { EntityOperation } from "../spec/types.js";

export type InvokeArgs = {
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
};

export class UnifiClient {
  readonly #cfg: Config;
  readonly #basePath: string;
  readonly #fetcher?: typeof fetch;

  constructor(cfg: Config, serverBasePath: string, fetcher?: typeof fetch) {
    this.#cfg = cfg;
    this.#basePath = serverBasePath.replace(/\/$/, "");
    this.#fetcher = fetcher;
  }

  async invoke(op: EntityOperation, args: InvokeArgs): Promise<unknown> {
    if (!op.read && !this.#cfg.allowWrites) {
      throw new Error(
        `Refusing '${op.operationId}' (${op.method}): server is read-only. Set UNIFI_ALLOW_WRITES=true to enable writes.`,
      );
    }
    const path = op.pathParams.reduce((acc, name) => {
      const value = args.pathParams?.[name];
      if (value === undefined) throw new Error(`Missing required path parameter '${name}' for '${op.operationId}'.`);
      return acc.replace(`{${name}}`, encodeURIComponent(value));
    }, op.path);

    const url = new URL(`${this.#basePath}${path}`, this.#cfg.baseUrl);
    for (const [k, v] of Object.entries(args.query ?? {})) url.searchParams.set(k, v);

    return request<unknown>({
      url,
      method: op.method,
      apiKey: this.#cfg.apiKey,
      timeoutMs: this.#cfg.timeoutMs,
      insecureTls: this.#cfg.insecureTls,
      ...(this.#cfg.caCert !== undefined ? { caCert: this.#cfg.caCert } : {}),
      operationId: op.operationId,
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(this.#fetcher ? { fetcher: this.#fetcher } : {}),
    });
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/unifi/client.test.ts`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add UnifiClient with read-only gate and param binding

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The four MCP tools

**Files:**
- Create: `src/mcp/tools.ts`, `src/mcp/errors-to-result.ts`
- Test: `test/mcp/tools.test.ts`

**Interfaces:**
- Consumes: `EntityIndex` (Task 6), `UnifiClient` (Task 9), `Logger` (Task 2), `Unifi*Error` (Task 2).
- Produces:
  ```ts
  type ToolResult = { content: ReadonlyArray<{ type: "text"; text: string }>; isError?: boolean };
  wrapHandler<A>(toolName: string, handler: (a: A) => Promise<ToolResult>, log: Logger): (a: A) => Promise<ToolResult>;
  buildTools(index: EntityIndex, client: UnifiClient): AnyTool[]; // 4 tools; each { name, description, inputSchema, handler }
  ```

- [ ] **Step 1: Write `src/mcp/errors-to-result.ts`** — adapt civi's `wrapHandler`:

```ts
import { UnifiApiError, UnifiAuthError, UnifiError, UnifiTransportError } from "../http/errors.js";
import type { Logger } from "../logging.js";

export type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>;
  isError?: boolean;
};

const message = (toolName: string, err: unknown): string => {
  if (err instanceof UnifiAuthError) return `Authentication failed in ${toolName}: ${err.message}`;
  if (err instanceof UnifiApiError) {
    const s = err.status === undefined ? "" : ` [HTTP ${err.status}]`;
    return `${err.operationId} returned an error: ${err.message}${s}`;
  }
  if (err instanceof UnifiTransportError) return `Transport error in ${toolName}: ${err.message}`;
  if (err instanceof UnifiError) return `${toolName}: ${err.message}`;
  if (err instanceof Error) return `${toolName}: ${err.message}`;
  return `Internal error in ${toolName} — see server logs.`;
};

export const wrapHandler = <A>(
  toolName: string,
  handler: (a: A) => Promise<ToolResult>,
  log: Logger,
): ((a: A) => Promise<ToolResult>) => {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      log.error({ tool: toolName, err }, "tool handler threw");
      return { content: [{ type: "text", text: message(toolName, err) }], isError: true };
    }
  };
};
```

- [ ] **Step 2: Write the failing test**

`test/mcp/tools.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";
import { UnifiClient } from "../../src/unifi/client.js";
import { buildTools } from "../../src/mcp/tools.js";
import type { Config } from "../../src/config.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const cfg: Config = {
  baseUrl: new URL("https://gw"), apiKey: "k", specUrl: "https://gw/s", specFreshnessMs: 1,
  cacheDir: "/tmp", timeoutMs: 500, insecureTls: false, allowWrites: false, logLevel: "error",
};
const index = new EntityIndex(buildResolvedSpec(mini));
const tool = (name: string, fetcher?: typeof fetch) =>
  buildTools(index, new UnifiClient(cfg, "/proxy/network/integration", fetcher)).find((t) => t.name === name)!;

describe("tools", () => {
  test("unifi_list_entities returns tags", async () => {
    const r = await tool("unifi_list_entities").handler({});
    expect(r.content[0]!.text).toContain("Devices");
  });

  test("unifi_describe_entity returns operations", async () => {
    const r = await tool("unifi_describe_entity").handler({ entity: "Devices" });
    expect(r.content[0]!.text).toContain("listDevices");
  });

  test("unifi_get invokes the read operation", async () => {
    const fetcher = mockFetch({ "GET /proxy/network/integration/v1/sites": { data: ["s1"] } });
    const r = await tool("unifi_get", fetcher).handler({ entity: "Sites", operationId: "listSites" });
    expect(r.content[0]!.text).toContain("s1");
  });

  test("unifi_invoke refuses writes while gated off", async () => {
    const r = await tool("unifi_invoke").handler({ entity: "Devices", operationId: "adoptDevice" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/read-only/i);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `pnpm vitest run test/mcp/tools.test.ts`

- [ ] **Step 4: Write `src/mcp/tools.ts`**

```ts
import { z } from "zod";
import type { EntityIndex } from "../spec/index.js";
import type { UnifiClient } from "../unifi/client.js";
import type { ToolResult } from "./errors-to-result.js";

export type { ToolResult };

export type AnyTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<ToolResult>;
};

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const invokeArgs = {
  entity: z.string(),
  operationId: z.string(),
  pathParams: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
};

export const buildTools = (index: EntityIndex, client: UnifiClient): AnyTool[] => [
  {
    name: "unifi_list_entities",
    description:
      "List UniFi entities (OpenAPI tags) exposed by this controller, with read/write op counts. Call first.",
    inputSchema: {},
    handler: async (): Promise<ToolResult> => text(index.listEntities()),
  },
  {
    name: "unifi_describe_entity",
    description:
      "Describe one entity: its operations, path/query parameters, and whether each is read (GET) or write.",
    inputSchema: { entity: z.string() },
    handler: async (args: { entity: string }): Promise<ToolResult> =>
      text(index.describeEntity(args.entity)),
  },
  {
    name: "unifi_get",
    description: "Invoke a read (GET) operation for an entity. Provide pathParams/query as needed.",
    inputSchema: {
      entity: z.string(),
      operationId: z.string(),
      pathParams: z.record(z.string(), z.string()).optional(),
      query: z.record(z.string(), z.string()).optional(),
    },
    handler: async (args: {
      entity: string;
      operationId: string;
      pathParams?: Record<string, string>;
      query?: Record<string, string>;
    }): Promise<ToolResult> => {
      const op = index.findReadOperation(args.entity, args.operationId);
      return text(
        await client.invoke(op, {
          ...(args.pathParams ? { pathParams: args.pathParams } : {}),
          ...(args.query ? { query: args.query } : {}),
        }),
      );
    },
  },
  {
    name: "unifi_invoke",
    description:
      "Invoke any operation by id (including writes). Gated off unless UNIFI_ALLOW_WRITES=true. Post-v1 write path.",
    inputSchema: invokeArgs,
    handler: async (args: {
      entity: string;
      operationId: string;
      pathParams?: Record<string, string>;
      query?: Record<string, string>;
      body?: unknown;
    }): Promise<ToolResult> => {
      const op = index.describeEntity(args.entity).operations.find((o) => o.operationId === args.operationId);
      if (!op) throw new Error(`Unknown operation '${args.operationId}' on entity '${args.entity}'.`);
      return text(
        await client.invoke(op, {
          ...(args.pathParams ? { pathParams: args.pathParams } : {}),
          ...(args.query ? { query: args.query } : {}),
          ...(args.body !== undefined ? { body: args.body } : {}),
        }),
      );
    },
  },
];
```

- [ ] **Step 5: Run it — expect PASS**

Run: `pnpm vitest run test/mcp/tools.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add four generic MCP tools and error-to-result seam

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Server wiring + CLI entrypoint

**Files:**
- Create: `src/mcp/server.ts`, `src/cli.ts`
- Test: `test/mcp/server.test.ts`

**Interfaces:**
- Consumes: `buildTools` (Task 10), `wrapHandler` (Task 10), `EntityIndex` (Task 6), `UnifiClient` (Task 9), `createSpecStore` (Task 8), `loadConfig` (Task 3), `createLogger` (Task 2).
- Produces: `buildServer(index, client, log): UnifiMcpServer` with `_registeredToolNames(): readonly string[]`; `cli.ts` default entrypoint.

- [ ] **Step 1: Write the failing test**

`test/mcp/server.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";
import { UnifiClient } from "../../src/unifi/client.js";
import { buildServer } from "../../src/mcp/server.js";
import { createLogger } from "../../src/logging.js";
import type { Config } from "../../src/config.js";

const cfg: Config = {
  baseUrl: new URL("https://gw"), apiKey: "k", specUrl: "https://gw/s", specFreshnessMs: 1,
  cacheDir: "/tmp", timeoutMs: 500, insecureTls: false, allowWrites: false, logLevel: "error",
};

describe("buildServer", () => {
  test("registers the four tools", () => {
    const index = new EntityIndex(buildResolvedSpec(mini));
    const server = buildServer(index, new UnifiClient(cfg, "/proxy/network/integration"), createLogger("error"));
    expect(server._registeredToolNames()).toEqual([
      "unifi_list_entities", "unifi_describe_entity", "unifi_get", "unifi_invoke",
    ]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm vitest run test/mcp/server.test.ts`

- [ ] **Step 3: Write `src/mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../logging.js";
import type { EntityIndex } from "../spec/index.js";
import type { UnifiClient } from "../unifi/client.js";
import { wrapHandler, type ToolResult } from "./errors-to-result.js";
import { buildTools } from "./tools.js";

export type UnifiMcpServer = McpServer & { _registeredToolNames(): readonly string[] };

export const buildServer = (index: EntityIndex, client: UnifiClient, log: Logger): UnifiMcpServer => {
  const server = new McpServer({ name: "unifi-mcp", version: "0.1.0" }) as UnifiMcpServer;
  const registered: string[] = [];

  for (const t of buildTools(index, client)) {
    const safe = wrapHandler(t.name, t.handler as (a: unknown) => Promise<ToolResult>, log);
    server.registerTool(
      t.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { description: t.description, inputSchema: t.inputSchema as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: unknown) => safe(args)) as any,
    );
    registered.push(t.name);
  }

  // eslint-disable-next-line no-underscore-dangle
  server._registeredToolNames = () => [...registered];
  return server;
};
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm vitest run test/mcp/server.test.ts`

- [ ] **Step 5: Write `src/cli.ts`**

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { buildServer } from "./mcp/server.js";
import { EntityIndex } from "./spec/index.js";
import { createSpecStore } from "./spec/factory.js";
import { UnifiClient } from "./unifi/client.js";

const main = async (): Promise<void> => {
  const cfg = loadConfig(process.env);
  const log = createLogger(cfg.logLevel);
  log.info({ baseUrl: cfg.baseUrl.toString(), allowWrites: cfg.allowWrites }, "starting unifi-mcp");
  if (cfg.insecureTls) {
    log.warn("UNIFI_INSECURE_TLS=true — TLS verification disabled; the connection is exposed to MITM. Prefer UNIFI_CA_CERT.");
  }

  const { spec, source } = await createSpecStore(cfg).resolve();
  log.info({ source, tags: spec.tags.length, operations: spec.operations.length }, "spec resolved");
  if (source === "bundled") log.warn("using bundled spec — gateway unreachable and no cache");

  const index = new EntityIndex(spec);
  const client = new UnifiClient(cfg, spec.serverBasePath);
  const server = buildServer(index, client, log);

  await server.connect(new StdioServerTransport());
  log.info("connected");
};

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
```

- [ ] **Step 6: Full verify + commit**

Run: `pnpm verify`
Expected: all clean, all tests pass.
```bash
git add -A
git commit -m "feat: wire MCP server and CLI entrypoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Project docs (README, LICENSE, .env.example)

**Files:**
- Create: `README.md`, `LICENSE`, `.env.example`

**Interfaces:**
- Produces: the minimum docs a user needs to install and configure the server. (CI, release, and publishing are the separate release-engineering plan.)

- [ ] **Step 1: Write `LICENSE`** — MIT, copyright holder "Robin Bowes".

- [ ] **Step 2: Write `.env.example`**

```bash
UNIFI_BASE_URL=https://192.168.1.1
UNIFI_API_KEY=your-integration-api-key
# TLS: gateways use self-signed certs. Prefer pinning the controller's CA:
# UNIFI_CA_CERT=/path/to/controller-ca.pem
# Last resort only (disables verification, MITM-exposed):
# UNIFI_INSECURE_TLS=false
# UNIFI_ALLOW_WRITES=false        # keep false until write support ships
# UNIFI_SPEC_FRESHNESS_MS=86400000
# UNIFI_LOG_LEVEL=error
```

- [ ] **Step 3: Write `README.md`**

Cover, in prose adapted from `../civi-mcp/README.md`: what it is (spec-driven MCP for the UniFi Local Integration API); the four tools (`unifi_list_entities`, `unifi_describe_entity`, `unifi_get`, `unifi_invoke`); the read-only stance and how to enable writes later; install/config via the env vars above; the TLS guidance (prefer `UNIFI_CA_CERT`); and the three-source spec cascade (fresh cache → live → stale-cache/bundled).

- [ ] **Step 4: Full verify + commit**

Run: `pnpm verify`
Expected: all clean, all tests pass.

```bash
git add -A
git commit -m "docs: add README, LICENSE, and .env.example

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Next cycle (separate plan): release engineering.** Adopt the yo61 house
> process from `../go-udap` and `../jobhound` — release-please, npm provenance
> (OIDC, no token), Taskfile, commitlint, zizmor/actionlint, dependabot,
> prek, a supply-chain security workflow, a Claude Code review workflow, and
> `decisions/`/`quality/` dirs — then backport it to `civi-mcp`.

## Self-Review

**Spec coverage:**
- Spec-driven runtime interface, zero per-resource code → Tasks 6, 9, 10 ✓
- Three-source cascade (fresh/live/stale/bundled) → Tasks 5, 7, 8 ✓
- Four generic tools; `list_entities` = tags → Task 10 ✓
- Read-only v1, two-place enforcement → EntityIndex `findReadOperation` (Task 6) + UnifiClient gate (Task 9) ✓
- Write seam (`unifi_invoke` defined, gated) → Task 10 ✓
- Discoverability (list → describe → get) → Task 10 ✓
- `X-API-KEY` auth → Tasks 3, 4 ✓
- TLS: default verification; `UNIFI_CA_CERT` pin; `UNIFI_INSECURE_TLS` explicit opt-in + startup warn → Tasks 3 (config), 4 (`dispatcherFor`), 11 (cli warn) ✓
- Error handling (typed, boundary-caught, stderr) → Tasks 2, 10 ✓
- Testing without a live controller → fixtures + injected deps throughout ✓
- Bundled-spec maintenance script → Task 5 ✓
- Stack matches civi-mcp; tooling reuse map → Tasks 1, 2 ✓
- Project docs (README/LICENSE/.env.example) → Task 12 ✓
- Release pipeline, CI, skill, MCPB packaging → deferred to the release-engineering plan (see Out-of-scope note) — intentionally not in this plan ✓

**Placeholder scan:** No `<SHA>` or CI placeholders remain (release engineering moved out). The bundled-spec source is a named commit pin (Task 5). No silent TODOs.

**Type consistency:** `EntityOperation` / `ResolvedSpec` / `EntitySummary` / `EntityDescribe` defined in Task 5, consumed unchanged in 6/9/10. `request(RequestInput)` (Task 4) consumed by Tasks 8, 9. `ToolResult` defined in Task 10 (`errors-to-result.ts`), re-exported via `tools.ts`. `buildResolvedSpec` + `EntityIndex` names consistent across 6/7/8/10/11. `UnifiClient.invoke(op, args)` signature consistent 9/10. ✓

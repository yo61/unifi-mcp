# unifi-mcp

A Model Context Protocol server for the UniFi Local Network Integration API.
Query your UniFi network from Claude Desktop, Claude Code, Cursor, or any MCP
client.

## Status

Phase 1 — read-only, four generic tools, spec-driven interface generated at
runtime from the UniFi OpenAPI spec.

## How it works

The server fetches the OpenAPI spec from your gateway at startup (or uses a
bundled fallback) and derives all tool behaviour from it — there is no
per-resource code. Adding a new UniFi entity or operation requires no code
change; it becomes available as soon as the updated spec is fetched.

The four tools follow a discover-then-query pattern:

| Tool                    | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `unifi_list_entities`   | List available entities (derived from OpenAPI tags)           |
| `unifi_describe_entity` | Operations, parameters, and fields for one entity             |
| `unifi_get`             | Invoke a read (GET) operation on an entity                    |
| `unifi_invoke`          | Invoke a write operation — disabled until write support ships |

The agent calls `unifi_list_entities` to discover what is available, then
`unifi_describe_entity` on an entity to learn its operations and field names,
then `unifi_get` to retrieve data.

## Read-only by default

`unifi_invoke` is defined and registered but gated: it returns an error unless
`UNIFI_ALLOW_WRITES=true` is set. The default is read-only. Write support will
ship in a later phase.

## Spec resolution

The server resolves the OpenAPI spec in order:

1. Fresh local cache (age < `UNIFI_SPEC_FRESHNESS_MS`, default 24 h)
2. Live fetch from the gateway (`UNIFI_BASE_URL/proxy/network/integration/v1`)
3. Stale local cache (if the live fetch fails)
4. Bundled spec (a static-inference draft, shipped with the package as a
   last-resort fallback)

Run `pnpm update-spec` to update the bundled spec from a live gateway.

## Configuration

Copy `.env.example` to `.env` and fill in the required values.

| Variable                  | Required | Default              | Description                                            |
| ------------------------- | -------- | -------------------- | ------------------------------------------------------ |
| `UNIFI_BASE_URL`          | yes      | —                    | Gateway address, e.g. `https://192.168.1.1`            |
| `UNIFI_API_KEY`           | yes      | —                    | Integration API key (see below)                        |
| `UNIFI_CA_CERT`           | no       | —                    | Path to the controller's CA certificate (PEM)          |
| `UNIFI_INSECURE_TLS`      | no       | `false`              | Disable TLS verification — last resort only            |
| `UNIFI_ALLOW_WRITES`      | no       | `false`              | Enable write operations via `unifi_invoke`             |
| `UNIFI_TIMEOUT_MS`        | no       | `30000`              | Per-request timeout in milliseconds                    |
| `UNIFI_SPEC_URL`          | no       | —                    | Override the OpenAPI spec URL fetched from the gateway |
| `UNIFI_SPEC_FILE`         | no       | —                    | Use a local spec file as the bundled fallback          |
| `UNIFI_CACHE_DIR`         | no       | `~/.cache/unifi-mcp` | Where the cached spec is written                       |
| `UNIFI_SPEC_FRESHNESS_MS` | no       | `86400000`           | Max age of the cached spec in milliseconds             |
| `UNIFI_LOG_LEVEL`         | no       | `error`              | Pino log level (`error`, `warn`, `info`, `debug`)      |

### Getting an API key

In the UniFi Network application: **Settings → Integrations → Add Integration**.
Copy the generated key into `UNIFI_API_KEY`.

### TLS

UniFi gateways use self-signed certificates. The recommended approach is to
pin the controller's CA certificate:

```bash
UNIFI_CA_CERT=/path/to/controller-ca.pem
```

Export the certificate from the UniFi console or your browser and provide the
path above. This keeps TLS verification enabled.

`UNIFI_INSECURE_TLS=true` disables certificate verification entirely. Use it
only as a last resort — it exposes connections to man-in-the-middle attacks.
The server prints a warning to stderr on startup when it is set.

## Running

```sh
pnpm install
pnpm build
node dist/cli.js      # or: unifi-mcp (after npm install -g @robinbowes/unifi-mcp)
```

Note: The package is published as `@robinbowes/unifi-mcp` (scoped), but the CLI
command is `unifi-mcp` — unchanged.

## Installing in an MCP client

The transport is stdio: the client spawns the binary and speaks MCP over its
stdin/stdout. The server reads configuration from the process environment only
— it does not load `.env` — so the gateway address and API key must come from
the client's own config block.

### Claude Code

```sh
claude mcp add unifi -s user \
  -e UNIFI_BASE_URL=https://192.168.1.1 \
  -e UNIFI_API_KEY=your-integration-api-key \
  -- npx -y @robinbowes/unifi-mcp
```

`-s user` makes the server available in every project; `-s local` (the default)
limits it to the current one. Avoid `-s project` with a literal key — that scope
writes to `.mcp.json`, which is committed. Confirm with `claude mcp list`.

A global install drops the npx resolution from every launch:

```sh
npm install -g @robinbowes/unifi-mcp
claude mcp add unifi -s user \
  -e UNIFI_BASE_URL=https://192.168.1.1 \
  -e UNIFI_API_KEY=your-integration-api-key \
  -- unifi-mcp
```

### Claude Desktop

Add an entry to `claude_desktop_config.json` and restart the app. It lives in
`~/Library/Application Support/Claude/` on macOS and `%APPDATA%\Claude\` on
Windows.

```json
{
    "mcpServers": {
        "unifi": {
            "command": "/usr/local/bin/node",
            "args": ["/usr/local/lib/node_modules/@robinbowes/unifi-mcp/dist/cli.js"],
            "env": {
                "UNIFI_BASE_URL": "https://192.168.1.1",
                "UNIFI_API_KEY": "your-integration-api-key"
            }
        }
    }
}
```

If the file already exists, merge the `unifi` key into the existing
`mcpServers` object — pasting the block over the whole file drops any other
servers you have configured.

Use absolute paths. Claude Desktop is a GUI application and does not inherit a
login shell's `PATH`, so a bare `node`, `npx`, or `unifi-mcp` fails to spawn.
`command -v node` and `npm root -g` give the paths for your machine.

Other stdio clients take the same `command`/`args`/`env` shape — Cursor and
Windsurf under `mcpServers`, Zed under `context_servers`.

### From a local checkout

```sh
pnpm install && pnpm build
claude mcp add unifi-dev \
  -e UNIFI_BASE_URL=https://192.168.1.1 \
  -e UNIFI_API_KEY=your-integration-api-key \
  -- node /absolute/path/to/unifi-mcp/dist/cli.js
```

### Troubleshooting

| Symptom                                    | Cause                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Server exits at once with `fatal: ...`     | `UNIFI_BASE_URL` or `UNIFI_API_KEY` missing or malformed — the client config never set them |
| `spawn ENOENT`                             | Relative command in a GUI client; use an absolute path                                      |
| Tools load, every query fails on TLS       | Self-signed gateway certificate; set `UNIFI_CA_CERT` to the controller's CA                 |
| Entity list looks unfamiliar or over-large | Gateway was unreachable at startup and the bundled draft spec was used as fallback          |

For the last two, set `UNIFI_LOG_LEVEL=info` and read the client's server log:
the server logs `spec resolved` with the source it used, and warns explicitly
when it falls back to the bundled spec.

## Development

```sh
pnpm install
task hooks-install    # install the git hooks (once per clone, and after they change)
pnpm dev              # run from source with stdio transport
pnpm test             # unit + component tests
pnpm verify           # format + lint + typecheck + test
pnpm update-spec      # refresh the bundled spec from a live gateway
pnpm smoke            # build, then exercise the tools against a live controller (.env)
```

`task hooks-install` is not optional bookkeeping: besides the pre-commit and
commit-msg checks, the hooks re-run `pnpm install --frozen-lockfile` after a
checkout, merge or rebase, which is what keeps `node_modules` matching the
lockfile for tools that read it directly (tsserver, ALE, `node dist/cli.js`).

### Smoke test

`pnpm smoke` builds the server and drives it as a real MCP client over stdio
against the controller configured in your `.env`. It fetches the live spec,
lists and describes entities, runs a couple of read queries, and confirms the
read-only gate refuses a write. It is read-only: nothing on the network is
changed, and the API key is never printed.

## Licence

MIT.

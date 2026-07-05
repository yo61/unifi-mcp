#!/usr/bin/env node
// Read-only smoke test against a live UniFi controller.
//
// Drives the built server (dist/cli.js) as a real MCP client over stdio and
// exercises the four tools end-to-end. Connection settings are read from the
// repo-root .env (UNIFI_BASE_URL, UNIFI_API_KEY, and UNIFI_INSECURE_TLS or
// UNIFI_CA_CERT). The API key is never printed. Nothing on the network is
// mutated: UNIFI_ALLOW_WRITES stays as configured and the write probe expects a
// read-only refusal (which fires before any request is sent).
//
// Usage: `pnpm smoke` (builds first), or `node scripts/smoke.mjs` against an
// existing build.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = (s = "") => process.stdout.write(`${s}\n`);
const err = (s = "") => process.stderr.write(`${s}\n`);

// Parse .env in JS (no shell): split on first '=', strip a trailing " # comment", trim.
const parseEnv = (text) => {
  const env = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .replace(/\s+#.*$/, "")
      .trim();
  }
  return env;
};

const envPath = join(REPO, ".env");
if (!existsSync(envPath)) {
  err(`No .env at ${envPath}. Copy .env.example to .env and set UNIFI_BASE_URL and UNIFI_API_KEY.`);
  process.exit(1);
}
const distCli = join(REPO, "dist", "cli.js");
if (!existsSync(distCli)) {
  err(`No build at ${distCli}. Run 'pnpm build' first (or use 'pnpm smoke').`);
  process.exit(1);
}

const fileEnv = parseEnv(readFileSync(envPath, "utf8"));
out("env passed to server:");
for (const [k, v] of Object.entries(fileEnv)) {
  out(`  ${k}=${k === "UNIFI_API_KEY" ? `<${v.length} chars>` : v}`);
}

const transport = new StdioClientTransport({
  command: "node",
  args: [distCli],
  cwd: REPO,
  env: { ...process.env, ...fileEnv },
  stderr: "inherit", // server's pino logs (spec source, base path, warnings) stream through
});
const client = new Client({ name: "unifi-mcp-smoke", version: "0.0.0" }, { capabilities: {} });

const textOf = (r) => r.content?.map((c) => c.text ?? "").join("\n") ?? "";
const asJson = (r) => {
  try {
    return JSON.parse(textOf(r));
  } catch {
    return textOf(r);
  }
};

const main = async () => {
  out("\n=== connecting (server resolves spec at startup) ===");
  await client.connect(transport);

  out("\n=== 1. tools/list ===");
  const tools = await client.listTools();
  out(`tools: ${tools.tools.map((t) => t.name).join(", ")}`);

  out("\n=== 2. unifi_list_entities (from the live spec) ===");
  const entities = asJson(await client.callTool({ name: "unifi_list_entities", arguments: {} }));
  const list = Array.isArray(entities) ? entities : [];
  out(`entity count: ${list.length}`);
  for (const e of list) out(`  ${e.name} (r:${e.readOps} w:${e.writeOps})`);

  const pick =
    list.find((e) => e.name === "Sites") ??
    list.find((e) => e.name === "UniFi Devices") ??
    list.find((e) => e.readOps > 0);
  out(`\n=== 3. unifi_describe_entity("${pick?.name}") ===`);
  const desc = asJson(
    await client.callTool({ name: "unifi_describe_entity", arguments: { entity: pick.name } }),
  );
  out(`apiBasePath: ${desc.apiBasePath}`);
  for (const o of desc.operations ?? []) {
    out(`  ${o.method.padEnd(4)} ${o.operationId}  requestPath:${o.requestPath}`);
  }

  const readOp = (desc.operations ?? []).find((o) => o.read && o.pathParams.length === 0);
  out(`\n=== 4. unifi_get (no path params): ${readOp?.operationId ?? "(none)"} ===`);
  let siteId;
  if (readOp) {
    const got = await client.callTool({
      name: "unifi_get",
      arguments: { entity: pick.name, operationId: readOp.operationId },
    });
    const body = textOf(got);
    out(`isError: ${got.isError ?? false}`);
    out(body.slice(0, 400));
    try {
      siteId = JSON.parse(body).data?.[0]?.id;
    } catch {
      siteId = undefined;
    }
  }

  out(`\n=== 4b. unifi_get with a {siteId} path param (siteId=${siteId}) ===`);
  let ppEntity;
  let ppOp;
  for (const e of list) {
    if (e.readOps === 0) continue;
    const d = asJson(
      await client.callTool({ name: "unifi_describe_entity", arguments: { entity: e.name } }),
    );
    const op = (d.operations ?? []).find(
      (o) => o.read && o.pathParams.length === 1 && o.pathParams[0] === "siteId",
    );
    if (op) {
      ppEntity = e.name;
      ppOp = op.operationId;
      break;
    }
  }
  if (ppOp && siteId) {
    const got = await client.callTool({
      name: "unifi_get",
      arguments: { entity: ppEntity, operationId: ppOp, pathParams: { siteId } },
    });
    out(`${ppEntity}.${ppOp} → isError: ${got.isError ?? false}`);
    out(textOf(got).slice(0, 400));
  } else {
    out("no {siteId}-only read op found, or no siteId; skipping.");
  }

  out("\n=== 5. probe: describe unknown entity → expect actionable isError ===");
  const bad = await client.callTool({
    name: "unifi_describe_entity",
    arguments: { entity: "NoSuchEntity" },
  });
  out(`isError: ${bad.isError ?? false} | ${textOf(bad).slice(0, 200)}`);

  out("\n=== 6. probe: unifi_invoke a write op while gated → expect refusal (no request sent) ===");
  let writeEntity;
  let writeOp;
  for (const e of list) {
    if (e.writeOps === 0) continue;
    const d = asJson(
      await client.callTool({ name: "unifi_describe_entity", arguments: { entity: e.name } }),
    );
    const w = (d.operations ?? []).find((o) => !o.read);
    if (w) {
      writeEntity = e.name;
      writeOp = w.operationId;
      break;
    }
  }
  if (writeOp) {
    const refused = await client.callTool({
      name: "unifi_invoke",
      arguments: {
        entity: writeEntity,
        operationId: writeOp,
        pathParams: siteId ? { siteId } : {},
      },
    });
    out(
      `invoke ${writeEntity}.${writeOp} → isError: ${refused.isError ?? false} | ${textOf(refused).slice(0, 220)}`,
    );
  } else {
    out("no write op found; (gate covered by unit tests).");
  }

  await client.close();
  out("\n=== smoke test complete ===");
};

const timer = setTimeout(() => {
  err("TIMEOUT after 60s");
  process.exit(2);
}, 60_000);

main()
  .then(() => {
    clearTimeout(timer);
    process.exit(0);
  })
  .catch((e) => {
    clearTimeout(timer);
    err(`SMOKE ERROR: ${e?.message ?? e}`);
    process.exit(1);
  });

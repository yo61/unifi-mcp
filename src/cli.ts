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
    log.warn(
      "UNIFI_INSECURE_TLS=true — TLS verification disabled; the connection is exposed to MITM. Prefer UNIFI_CA_CERT.",
    );
  }

  const { spec, source } = await createSpecStore(cfg).resolve();
  log.info({ source, tags: spec.tags.length, operations: spec.operations.length }, "spec resolved");
  if (source === "bundled") log.warn("using bundled spec — gateway unreachable and no cache");

  const index = new EntityIndex(spec);
  log.info({ basePath: spec.apiBasePath }, "api base path");
  const client = new UnifiClient(cfg, spec.apiBasePath);
  const server = buildServer(index, client, log);

  await server.connect(new StdioServerTransport());
  log.info("connected");
};

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

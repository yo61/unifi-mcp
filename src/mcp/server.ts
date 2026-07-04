import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../logging.js";
import type { EntityIndex } from "../spec/index.js";
import type { UnifiClient } from "../unifi/client.js";
import type { ToolResult } from "./errors-to-result.js";
import { buildTools } from "./tools.js";

export type UnifiMcpServer = McpServer & { _registeredToolNames(): readonly string[] };

export const buildServer = (
  index: EntityIndex,
  client: UnifiClient,
  log: Logger,
): UnifiMcpServer => {
  const server = new McpServer({ name: "unifi-mcp", version: "0.1.0" }) as UnifiMcpServer;
  const registered: string[] = [];

  // buildTools already wraps each handler (wrapHandler) with this logger, so
  // register the handlers directly — do not wrap a second time.
  for (const t of buildTools(index, client, log)) {
    server.registerTool(
      t.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { description: t.description, inputSchema: t.inputSchema as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: unknown) => (t.handler as (a: unknown) => Promise<ToolResult>)(args)) as any,
    );
    registered.push(t.name);
  }

  // eslint-disable-next-line no-underscore-dangle
  server._registeredToolNames = () => [...registered];
  return server;
};

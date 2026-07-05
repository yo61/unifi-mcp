import { z } from "zod";
import { asEntityTag, asOperationId } from "../brands.js";
import type { EntityIndex } from "../spec/index.js";
import { requestPath } from "../spec/operation.js";
import type { UnifiClient } from "../unifi/client.js";
import type { ToolResult } from "./errors-to-result.js";
import { wrapHandler } from "./errors-to-result.js";
import type { Logger } from "../logging.js";

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

export const buildTools = (index: EntityIndex, client: UnifiClient, log: Logger): AnyTool[] => {
  return [
    {
      name: "unifi_list_entities",
      description:
        "List UniFi entities (OpenAPI tags) exposed by this controller, with read/write op counts. Call first.",
      inputSchema: {},
      handler: wrapHandler(
        "unifi_list_entities",
        async (): Promise<ToolResult> => text(index.listEntities()),
        log,
      ) as AnyTool["handler"],
    },
    {
      name: "unifi_describe_entity",
      description:
        "Describe one entity: its operations, path/query parameters, and whether each is read (GET) or write.",
      inputSchema: { entity: z.string() },
      handler: wrapHandler(
        "unifi_describe_entity",
        async (args: { entity: string }): Promise<ToolResult> => {
          const described = index.describeEntity(asEntityTag(args.entity));
          const base = client.basePath;
          return text({
            entity: described.entity,
            apiBasePath: base,
            note: `Operations resolve under the reverse-proxy mount '${base}', recovered from the spec URL — the served OpenAPI 'servers' url is root-relative and omits this mount. Call an operation with unifi_get/unifi_invoke (entity + operationId + pathParams/query); the server prepends the mount and builds the full URL.`,
            operations: described.operations.map((o) => ({
              ...o,
              requestPath: requestPath(o, base),
            })),
          });
        },
        log,
      ) as AnyTool["handler"],
    },
    {
      name: "unifi_get",
      description:
        "Invoke a read (GET) operation for an entity. Provide pathParams/query as needed.",
      inputSchema: {
        entity: z.string(),
        operationId: z.string(),
        pathParams: z.record(z.string(), z.string()).optional(),
        query: z.record(z.string(), z.string()).optional(),
      },
      handler: wrapHandler(
        "unifi_get",
        async (args: {
          entity: string;
          operationId: string;
          pathParams?: Record<string, string>;
          query?: Record<string, string>;
        }): Promise<ToolResult> => {
          const op = index.findReadOperation(
            asEntityTag(args.entity),
            asOperationId(args.operationId),
          );
          return text(
            await client.invoke(op, {
              ...(args.pathParams ? { pathParams: args.pathParams } : {}),
              ...(args.query ? { query: args.query } : {}),
            }),
          );
        },
        log,
      ) as AnyTool["handler"],
    },
    {
      name: "unifi_invoke",
      description:
        "Invoke any operation by id (including writes). Gated off unless UNIFI_ALLOW_WRITES=true. Post-v1 write path.",
      inputSchema: invokeArgs,
      handler: wrapHandler(
        "unifi_invoke",
        async (args: {
          entity: string;
          operationId: string;
          pathParams?: Record<string, string>;
          query?: Record<string, string>;
          body?: unknown;
        }): Promise<ToolResult> => {
          const op = index
            .describeEntity(asEntityTag(args.entity))
            .operations.find((o) => o.operationId === asOperationId(args.operationId));
          if (!op)
            throw new Error(`Unknown operation '${args.operationId}' on entity '${args.entity}'.`);
          return text(
            await client.invoke(op, {
              ...(args.pathParams ? { pathParams: args.pathParams } : {}),
              ...(args.query ? { query: args.query } : {}),
              ...(args.body !== undefined ? { body: args.body } : {}),
            }),
          );
        },
        log,
      ) as AnyTool["handler"],
    },
  ];
};

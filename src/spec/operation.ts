import type { EntityOperation } from "./types.js";

/**
 * The path an operation resolves to under a given API base — i.e. what the
 * server actually requests. Derived logic that belongs to the operation
 * concept, not to the MCP tool layer that displays it.
 */
export const requestPath = (op: EntityOperation, apiBasePath: string): string =>
  `${apiBasePath}${op.path}`;

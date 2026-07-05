import type { EntityTag, OperationId } from "../brands.js";

export type ResolvedSpec = {
  tags: ReadonlyArray<{ name: EntityTag; description?: string }>;
  operations: readonly EntityOperation[];
  /** The fully-resolved API base path requests are sent under, including the reverse-proxy mount (e.g. `/proxy/network/integration`). */
  apiBasePath: string;
};

export type EntityOperation = {
  operationId: OperationId;
  tag: EntityTag;
  method: string;
  path: string;
  summary?: string;
  read: boolean;
  pathParams: readonly string[];
  queryParams: ReadonlyArray<{ name: string; required: boolean; description?: string }>;
  requestBodySchema?: unknown;
  responseSchema?: unknown;
};

export type EntitySummary = {
  name: EntityTag;
  description?: string;
  readOps: number;
  writeOps: number;
};

export type EntityDescribe = { entity: EntityTag; operations: readonly EntityOperation[] };

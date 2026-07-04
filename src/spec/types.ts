export type ResolvedSpec = {
  tags: ReadonlyArray<{ name: string; description?: string }>;
  operations: readonly EntityOperation[];
  serverBasePath: string;
};

export type EntityOperation = {
  operationId: string;
  tag: string;
  method: string;
  path: string;
  summary?: string;
  read: boolean;
  pathParams: readonly string[];
  queryParams: ReadonlyArray<{ name: string; required: boolean; description?: string }>;
  requestBodySchema?: unknown;
  responseSchema?: unknown;
};

export type EntitySummary = { name: string; description?: string; readOps: number; writeOps: number };

export type EntityDescribe = { entity: string; operations: readonly EntityOperation[] };

import { asEntityTag, asOperationId, type EntityTag, type OperationId } from "../brands.js";
import { resolveApiBasePath } from "./base-path.js";
import type { EntityDescribe, EntityOperation, EntitySummary, ResolvedSpec } from "./types.js";

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

/**
 * Project a dereferenced OpenAPI document into the domain model. `specUrl` is
 * the URL the document was fetched from — needed to recover the reverse-proxy
 * mount for `apiBasePath` (see `resolveApiBasePath`).
 */
export const buildResolvedSpec = (deref: unknown, specUrl: string): ResolvedSpec => {
  const doc = deref as RawDoc;
  const operations: EntityOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const params = op.parameters ?? [];
      const requestBodySchema = jsonSchema(op.requestBody);
      const responseSchema = jsonSchema(op.responses?.["200"]);
      operations.push({
        operationId: asOperationId(op.operationId ?? `${method.toUpperCase()} ${path}`),
        tag: asEntityTag(op.tags?.[0] ?? "Untagged"),
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
  const serverBasePath = doc.servers?.[0]?.url ?? "";
  return {
    tags: (doc.tags ?? []).map((t) => ({
      name: asEntityTag(t.name),
      ...(t.description !== undefined ? { description: t.description } : {}),
    })),
    operations,
    apiBasePath: resolveApiBasePath(specUrl, serverBasePath),
  };
};

export class EntityIndex {
  readonly #spec: ResolvedSpec;
  readonly #byTag = new Map<EntityTag, EntityOperation[]>();

  constructor(spec: ResolvedSpec) {
    this.#spec = spec;
    for (const { name } of spec.tags) {
      this.#byTag.set(name, []);
    }
    for (const op of spec.operations) {
      const list = this.#byTag.get(op.tag) ?? [];
      list.push(op);
      this.#byTag.set(op.tag, list);
    }
  }

  listEntities(): readonly EntitySummary[] {
    const declared = new Map(this.#spec.tags.map((t) => [t.name, t.description]));
    const names = new Set<EntityTag>([...declared.keys(), ...this.#byTag.keys()]);
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

  describeEntity(tag: EntityTag): EntityDescribe {
    const operations = this.#byTag.get(tag);
    if (!operations) throw new Error(`Unknown entity '${tag}'. Call unifi_list_entities first.`);
    return { entity: tag, operations };
  }

  findReadOperation(tag: EntityTag, operationId: OperationId): EntityOperation {
    const op = this.describeEntity(tag).operations.find((o) => o.operationId === operationId);
    if (!op) throw new Error(`Unknown operation '${operationId}' on entity '${tag}'.`);
    if (!op.read) throw new Error(`Operation '${operationId}' is not a read (GET) operation.`);
    return op;
  }
}

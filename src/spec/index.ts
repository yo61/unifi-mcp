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
        ...(jsonSchema(op.requestBody) !== undefined ? { requestBodySchema: jsonSchema(op.requestBody) } : {}),
        ...(jsonSchema(op.responses?.["200"]) !== undefined
          ? { responseSchema: jsonSchema(op.responses?.["200"]) }
          : {}),
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

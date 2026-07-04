import type { Config } from "../config.js";
import { request } from "../http/request.js";
import type { EntityOperation } from "../spec/types.js";

export type InvokeArgs = {
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
};

export class UnifiClient {
  readonly #cfg: Config;
  readonly #basePath: string;
  readonly #fetcher: typeof fetch | undefined;

  constructor(cfg: Config, serverBasePath: string, fetcher?: typeof fetch) {
    this.#cfg = cfg;
    this.#basePath = serverBasePath.replace(/\/$/, "");
    this.#fetcher = fetcher;
  }

  async invoke(op: EntityOperation, args: InvokeArgs): Promise<unknown> {
    if (!op.read && !this.#cfg.allowWrites) {
      throw new Error(
        `Refusing '${op.operationId}' (${op.method}): server is read-only. Set UNIFI_ALLOW_WRITES=true to enable writes.`,
      );
    }
    const path = op.pathParams.reduce((acc, name) => {
      const value = args.pathParams?.[name];
      if (value === undefined)
        throw new Error(`Missing required path parameter '${name}' for '${op.operationId}'.`);
      return acc.replace(`{${name}}`, encodeURIComponent(value));
    }, op.path);

    const url = new URL(`${this.#basePath}${path}`, this.#cfg.baseUrl);
    for (const [k, v] of Object.entries(args.query ?? {})) url.searchParams.set(k, v);

    return request<unknown>({
      url,
      method: op.method,
      apiKey: this.#cfg.apiKey,
      timeoutMs: this.#cfg.timeoutMs,
      insecureTls: this.#cfg.insecureTls,
      ...(this.#cfg.caCert !== undefined ? { caCert: this.#cfg.caCert } : {}),
      operationId: op.operationId,
      ...(args.body !== undefined ? { body: args.body } : {}),
      ...(this.#fetcher ? { fetcher: this.#fetcher } : {}),
    });
  }
}

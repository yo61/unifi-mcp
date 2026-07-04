import { buildResolvedSpec } from "./index.js";
import type { ResolvedSpec } from "./types.js";

export type SpecSource = "fresh-cache" | "live" | "stale-cache" | "bundled";

export type SpecStoreDeps = {
  now(): number;
  readCache(): Promise<{ fetchedAt: number; doc: unknown } | undefined>;
  writeCache(entry: { fetchedAt: number; doc: unknown }): Promise<void>;
  fetchLive(): Promise<unknown>;
  readBundled(): Promise<unknown>;
  dereference(doc: unknown): Promise<unknown>;
};

export class SpecStore {
  readonly #freshnessMs: number;
  readonly #deps: SpecStoreDeps;

  constructor(freshnessMs: number, deps: SpecStoreDeps) {
    this.#freshnessMs = freshnessMs;
    this.#deps = deps;
  }

  async resolve(): Promise<{ spec: ResolvedSpec; source: SpecSource }> {
    const d = this.#deps;
    const cache = await d.readCache();

    if (cache && d.now() - cache.fetchedAt < this.#freshnessMs) {
      return this.#finish(cache.doc, "fresh-cache");
    }

    try {
      const doc = await d.fetchLive();
      await d.writeCache({ fetchedAt: d.now(), doc });
      return this.#finish(doc, "live");
    } catch {
      if (cache) return this.#finish(cache.doc, "stale-cache");
      return this.#finish(await d.readBundled(), "bundled");
    }
  }

  async #finish(doc: unknown, source: SpecSource): Promise<{ spec: ResolvedSpec; source: SpecSource }> {
    const deref = await this.#deps.dereference(doc);
    return { spec: buildResolvedSpec(deref), source };
  }
}

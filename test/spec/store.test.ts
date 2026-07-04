import { describe, expect, test, vi } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { SpecStore, type SpecStoreDeps } from "../../src/spec/store.js";

const baseDeps = (over: Partial<SpecStoreDeps>): SpecStoreDeps => ({
  now: () => 1_000_000,
  readCache: async () => undefined,
  writeCache: async () => {},
  fetchLive: async () => mini,
  readBundled: async () => mini,
  dereference: async (d) => d,
  ...over,
});

describe("SpecStore cascade", () => {
  test("fresh cache short-circuits the network", async () => {
    const fetchLive = vi.fn(async () => mini);
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 999_500, doc: mini }),
      fetchLive,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("fresh-cache");
    expect(fetchLive).not.toHaveBeenCalled();
  });

  test("stale cache triggers live fetch and rewrites cache", async () => {
    const writeCache = vi.fn(async () => {});
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 100, doc: mini }),
      writeCache,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("live");
    expect(writeCache).toHaveBeenCalledWith({ fetchedAt: 1_000_000, doc: mini });
  });

  test("live failure with stale cache uses stale cache (beats bundled)", async () => {
    const readBundled = vi.fn(async () => mini);
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => ({ fetchedAt: 100, doc: mini }),
      fetchLive: async () => { throw new Error("unreachable"); },
      readBundled,
    }));
    const { source } = await store.resolve();
    expect(source).toBe("stale-cache");
    expect(readBundled).not.toHaveBeenCalled();
  });

  test("live failure with no cache falls back to bundled", async () => {
    const store = new SpecStore(1000, baseDeps({
      readCache: async () => undefined,
      fetchLive: async () => { throw new Error("unreachable"); },
    }));
    const { source, spec } = await store.resolve();
    expect(source).toBe("bundled");
    expect(spec.tags.map((t) => t.name)).toContain("Devices");
  });
});

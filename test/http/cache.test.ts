import { describe, expect, test, vi } from "vitest";
import { PromiseCache } from "../../src/http/cache.js";

describe("PromiseCache", () => {
  test("loads once and memoises", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("does not cache a rejected load", async () => {
    const cache = new PromiseCache<string, number>();
    await expect(
      cache.getOrLoad("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", async () => 7)).toBe(7);
  });
});

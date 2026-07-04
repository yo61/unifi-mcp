import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createSpecStore } from "../../src/spec/factory.js";
import type { Config } from "../../src/config.js";

let dir: string;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

const cfg = (over: Partial<Config>): Config => ({
  baseUrl: new URL("https://127.0.0.1"),
  apiKey: "k",
  specUrl: "https://127.0.0.1/nope.json",
  specFreshnessMs: 1000,
  cacheDir: dir,
  timeoutMs: 200,
  insecureTls: false,
  allowWrites: false,
  logLevel: "error",
  ...over,
});

describe("createSpecStore", () => {
  test("falls back to bundled spec when the gateway is unreachable", async () => {
    dir = mkdtempSync(join(tmpdir(), "unifi-spec-"));
    const store = createSpecStore(cfg({ cacheDir: dir }));
    const { source, spec } = await store.resolve();
    expect(source).toBe("bundled");
    expect(spec.operations.length).toBeGreaterThan(0);
  });
});

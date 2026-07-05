import { describe, expect, test } from "vitest";
import { resolveApiBasePath } from "../../src/spec/base-path.js";

describe("resolveApiBasePath", () => {
  test("prepends the spec mount prefix to the server base (UniFi default)", () => {
    expect(resolveApiBasePath("https://gw/proxy/network/api-docs/integration.json", "/integration")).toBe(
      "/proxy/network/integration",
    );
  });

  test("collapses a trailing slash on the server base", () => {
    expect(resolveApiBasePath("https://gw/proxy/network/api-docs/integration.json", "/integration/")).toBe(
      "/proxy/network/integration",
    );
  });

  test("falls back to the spec URL directory when there is no /api-docs/ marker", () => {
    expect(resolveApiBasePath("https://gw/custom/spec.json", "/integration")).toBe("/custom/integration");
  });

  test("handles an empty server base by returning the mount", () => {
    expect(resolveApiBasePath("https://gw/proxy/network/api-docs/integration.json", "")).toBe(
      "/proxy/network",
    );
  });
});

import { describe, expect, test } from "vitest";
import { apiBasePath } from "../../src/unifi/base-path.js";

describe("apiBasePath", () => {
  test("prepends the spec mount prefix to the server base (UniFi default)", () => {
    expect(apiBasePath("https://gw/proxy/network/api-docs/integration.json", "/integration")).toBe(
      "/proxy/network/integration",
    );
  });

  test("collapses a trailing slash on the server base", () => {
    expect(apiBasePath("https://gw/proxy/network/api-docs/integration.json", "/integration/")).toBe(
      "/proxy/network/integration",
    );
  });

  test("falls back to the spec URL directory when there is no /api-docs/ marker", () => {
    expect(apiBasePath("https://gw/custom/spec.json", "/integration")).toBe("/custom/integration");
  });

  test("handles an empty server base by returning the mount", () => {
    expect(apiBasePath("https://gw/proxy/network/api-docs/integration.json", "")).toBe(
      "/proxy/network",
    );
  });
});

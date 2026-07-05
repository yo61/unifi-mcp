import { describe, expect, test } from "vitest";
import { asApiKey, asEntityTag, asOperationId } from "../../src/brands.js";
import { UnifiClient } from "../../src/unifi/client.js";
import type { EntityOperation } from "../../src/spec/types.js";
import type { Config } from "../../src/config.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const cfg = (over: Partial<Config> = {}): Config => ({
  baseUrl: new URL("https://gw"),
  apiKey: asApiKey("k"),
  specUrl: "https://gw/s.json",
  specFreshnessMs: 1,
  cacheDir: "/tmp",
  timeoutMs: 500,
  insecureTls: false,
  allowWrites: false,
  logLevel: "error",
  ...over,
});

const listDevices: EntityOperation = {
  operationId: asOperationId("listDevices"),
  tag: asEntityTag("Devices"),
  method: "GET",
  path: "/v1/sites/{siteId}/devices",
  read: true,
  pathParams: ["siteId"],
  queryParams: [{ name: "limit", required: false }],
};
const adopt: EntityOperation = {
  ...listDevices,
  operationId: asOperationId("adopt"),
  method: "POST",
  read: false,
};

describe("UnifiClient", () => {
  test("binds path params and query, prefixing the server base path", async () => {
    const fetcher = mockFetch({
      "GET /proxy/network/integration/v1/sites/s1/devices": { data: [] },
    });
    const client = new UnifiClient(cfg(), "/proxy/network/integration", fetcher);
    const out = await client.invoke(listDevices, {
      pathParams: { siteId: "s1" },
      query: { limit: "5" },
    });
    expect(out).toEqual({ data: [] });
    const calledUrl = new URL(fetcher.mock.calls[0]![0] as string | URL);
    expect(calledUrl.pathname).toBe("/proxy/network/integration/v1/sites/s1/devices");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });

  test("refuses a write operation while allowWrites is false", async () => {
    const client = new UnifiClient(cfg({ allowWrites: false }), "/proxy/network/integration");
    await expect(client.invoke(adopt, { pathParams: { siteId: "s1" } })).rejects.toThrow(
      /read-only/i,
    );
  });

  test("missing required path param is an actionable error", async () => {
    const client = new UnifiClient(cfg(), "/proxy/network/integration");
    await expect(client.invoke(listDevices, {})).rejects.toThrow(/siteId/);
  });
});

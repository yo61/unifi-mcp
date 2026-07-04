import { describe, expect, test } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";
import { UnifiClient } from "../../src/unifi/client.js";
import { buildTools } from "../../src/mcp/tools.js";
import type { Config } from "../../src/config.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const cfg: Config = {
  baseUrl: new URL("https://gw"),
  apiKey: "k",
  specUrl: "https://gw/s",
  specFreshnessMs: 1,
  cacheDir: "/tmp",
  timeoutMs: 500,
  insecureTls: false,
  allowWrites: false,
  logLevel: "error",
};
const index = new EntityIndex(buildResolvedSpec(mini));
const tool = (name: string, fetcher?: typeof fetch) =>
  buildTools(index, new UnifiClient(cfg, "/proxy/network/integration", fetcher)).find(
    (t) => t.name === name,
  )!;

describe("tools", () => {
  test("unifi_list_entities returns tags", async () => {
    const r = await tool("unifi_list_entities").handler({});
    expect(r.content[0]!.text).toContain("Devices");
  });

  test("unifi_describe_entity returns operations", async () => {
    const r = await tool("unifi_describe_entity").handler({ entity: "Devices" });
    expect(r.content[0]!.text).toContain("listDevices");
  });

  test("unifi_get invokes the read operation", async () => {
    const fetcher = mockFetch({ "GET /proxy/network/integration/v1/sites": { data: ["s1"] } });
    const r = await tool("unifi_get", fetcher).handler({
      entity: "Sites",
      operationId: "listSites",
    });
    expect(r.content[0]!.text).toContain("s1");
  });

  test("unifi_invoke refuses writes while gated off", async () => {
    const r = await tool("unifi_invoke").handler({ entity: "Devices", operationId: "adoptDevice" });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/read-only/i);
  });
});

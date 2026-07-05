import { describe, expect, test } from "vitest";
import { asApiKey } from "../../src/brands.js";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";
import { UnifiClient } from "../../src/unifi/client.js";
import { buildServer } from "../../src/mcp/server.js";
import { createLogger } from "../../src/logging.js";
import type { Config } from "../../src/config.js";

const cfg: Config = {
  baseUrl: new URL("https://gw"),
  apiKey: asApiKey("k"),
  specUrl: "https://gw/s",
  specFreshnessMs: 1,
  cacheDir: "/tmp",
  timeoutMs: 500,
  insecureTls: false,
  allowWrites: false,
  logLevel: "error",
};

describe("buildServer", () => {
  test("registers the four tools", () => {
    const index = new EntityIndex(
      buildResolvedSpec(mini, "https://gw/proxy/network/api-docs/integration.json"),
    );
    const server = buildServer(
      index,
      new UnifiClient(cfg, "/proxy/network/integration"),
      createLogger("error"),
    );
    // eslint-disable-next-line no-underscore-dangle
    expect(server._registeredToolNames()).toEqual([
      "unifi_list_entities",
      "unifi_describe_entity",
      "unifi_get",
      "unifi_invoke",
    ]);
  });
});

import { describe, expect, test } from "vitest";
import { asEntityTag, asOperationId } from "../../src/brands.js";
const SPEC_URL = "https://gw/proxy/network/api-docs/integration.json";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";

const index = new EntityIndex(buildResolvedSpec(mini, SPEC_URL));

describe("EntityIndex", () => {
  test("lists entities from tags with read/write counts", () => {
    const entities = index.listEntities();
    const devices = entities.find((e) => e.name === "Devices");
    expect(devices).toMatchObject({ readOps: 1, writeOps: 1 });
    expect(entities.find((e) => e.name === "Sites")).toMatchObject({ readOps: 1, writeOps: 0 });
  });

  test("describeEntity returns operations with params", () => {
    const d = index.describeEntity(asEntityTag("Devices"));
    const list = d.operations.find((o) => o.operationId === "listDevices");
    expect(list?.pathParams).toEqual(["siteId"]);
    expect(list?.queryParams.map((q) => q.name)).toContain("limit");
    expect(list?.read).toBe(true);
  });

  test("describeEntity throws on unknown tag", () => {
    expect(() => index.describeEntity(asEntityTag("Nope"))).toThrow(/unknown entity/i);
  });

  test("findReadOperation refuses a write operation", () => {
    expect(() => index.findReadOperation(asEntityTag("Devices"), asOperationId("adoptDevice"))).toThrow(/not a read/i);
  });
});

describe("EntityIndex — declared-but-empty tag", () => {
  const emptyTagSpec = buildResolvedSpec({
    tags: [{ name: "Ping" }, { name: "Devices" }],
    paths: {
      "/devices": {
        get: {
          operationId: "listDevices",
          tags: ["Devices"],
          responses: {},
        },
      },
    },
  }, SPEC_URL);
  const emptyIndex = new EntityIndex(emptyTagSpec);

  test("listEntities includes Ping with readOps:0 writeOps:0", () => {
    const entities = emptyIndex.listEntities();
    expect(entities.find((e) => e.name === "Ping")).toMatchObject({ readOps: 0, writeOps: 0 });
  });

  test("describeEntity returns empty operations for declared-but-empty tag", () => {
    const result = emptyIndex.describeEntity(asEntityTag("Ping"));
    expect(result).toEqual({ entity: "Ping", operations: [] });
  });

  test("describeEntity still throws for a tag neither declared nor on any operation", () => {
    expect(() => emptyIndex.describeEntity(asEntityTag("Nonexistent"))).toThrow(/unknown entity/i);
  });
});

import { describe, expect, test } from "vitest";
import mini from "../helpers/fixtures/mini-spec.json" with { type: "json" };
import { EntityIndex, buildResolvedSpec } from "../../src/spec/index.js";

const index = new EntityIndex(buildResolvedSpec(mini));

describe("EntityIndex", () => {
  test("lists entities from tags with read/write counts", () => {
    const entities = index.listEntities();
    const devices = entities.find((e) => e.name === "Devices");
    expect(devices).toMatchObject({ readOps: 1, writeOps: 1 });
    expect(entities.find((e) => e.name === "Sites")).toMatchObject({ readOps: 1, writeOps: 0 });
  });

  test("describeEntity returns operations with params", () => {
    const d = index.describeEntity("Devices");
    const list = d.operations.find((o) => o.operationId === "listDevices");
    expect(list?.pathParams).toEqual(["siteId"]);
    expect(list?.queryParams.map((q) => q.name)).toContain("limit");
    expect(list?.read).toBe(true);
  });

  test("describeEntity throws on unknown tag", () => {
    expect(() => index.describeEntity("Nope")).toThrow(/unknown entity/i);
  });

  test("findReadOperation refuses a write operation", () => {
    expect(() => index.findReadOperation("Devices", "adoptDevice")).toThrow(/not a read/i);
  });
});

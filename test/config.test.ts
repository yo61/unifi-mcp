import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { UNIFI_BASE_URL: "https://192.168.1.1", UNIFI_API_KEY: "key123" };

describe("loadConfig", () => {
  test("applies defaults", () => {
    const cfg = loadConfig(base);
    expect(cfg.baseUrl.host).toBe("192.168.1.1");
    expect(cfg.specUrl).toBe("https://192.168.1.1/proxy/network/api-docs/integration.json");
    expect(cfg.insecureTls).toBe(false);
    expect(cfg.caCert).toBeUndefined();
    expect(cfg.allowWrites).toBe(false);
    expect(cfg.specFreshnessMs).toBe(86_400_000);
  });

  test("insecureTls opt-in requires explicit true", () => {
    expect(loadConfig({ ...base, UNIFI_INSECURE_TLS: "true" }).insecureTls).toBe(true);
    expect(loadConfig({ ...base, UNIFI_INSECURE_TLS: "1" }).insecureTls).toBe(false);
  });

  test("rejects missing api key", () => {
    expect(() => loadConfig({ UNIFI_BASE_URL: "https://x" })).toThrow(/UNIFI_API_KEY/);
  });

  test("rejects invalid base url", () => {
    expect(() => loadConfig({ UNIFI_BASE_URL: "not-a-url", UNIFI_API_KEY: "k" })).toThrow(
      /UNIFI_BASE_URL/,
    );
  });

  test("allowWrites stays false unless explicitly true", () => {
    expect(loadConfig({ ...base, UNIFI_ALLOW_WRITES: "1" }).allowWrites).toBe(false);
    expect(loadConfig({ ...base, UNIFI_ALLOW_WRITES: "true" }).allowWrites).toBe(true);
  });

  test("rejects non-existent UNIFI_CA_CERT path", () => {
    expect(() => loadConfig({ ...base, UNIFI_CA_CERT: "/nonexistent/path/ca.pem" })).toThrow(
      /UNIFI_CA_CERT/,
    );
  });
});

import { describe, expect, test, vi } from "vitest";
import { UnifiApiError, UnifiAuthError, UnifiTransportError } from "../../src/http/errors.js";
import { request } from "../../src/http/request.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const opts = { apiKey: "k", timeoutMs: 1000, insecureTls: false as const };

describe("request", () => {
  test("sends X-API-KEY and parses JSON", async () => {
    const fetcher = mockFetch({ "GET /v1/sites": { data: [{ id: "s1" }] } });
    const out = await request<{ data: unknown[] }>({
      url: new URL("https://gw/v1/sites"),
      method: "GET",
      fetcher,
      ...opts,
    });
    expect(out.data).toHaveLength(1);
    const headers = (fetcher.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("k");
  });

  test("maps 401 to UnifiAuthError", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("no", { status: 401 }));
    await expect(
      request({ url: new URL("https://gw/v1/sites"), method: "GET", fetcher, ...opts }),
    ).rejects.toBeInstanceOf(UnifiAuthError);
  });

  test("maps non-ok to UnifiApiError with status", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ message: "bad" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      request({
        url: new URL("https://gw/v1/x"),
        method: "GET",
        fetcher,
        operationId: "getX",
        ...opts,
      }),
    ).rejects.toMatchObject({ constructor: UnifiApiError, status: 400 });
  });

  test("wraps non-JSON body in UnifiTransportError with snippet", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response("<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(
      request({ url: new URL("https://gw/v1/x"), method: "GET", fetcher, ...opts }),
    ).rejects.toBeInstanceOf(UnifiTransportError);
  });
});

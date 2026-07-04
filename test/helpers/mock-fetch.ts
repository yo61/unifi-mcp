import { vi } from "vitest";

export type RouteMap = Record<string, unknown>; // "GET /v1/sites" -> body

export const mockFetch = (routes: RouteMap) =>
  vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname}`;
    const body = routes[key];
    if (body === undefined) throw new Error(`mockFetch: no route for ${key}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

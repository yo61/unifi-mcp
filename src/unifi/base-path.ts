/**
 * Derive the API base path for the UniFi integration API.
 *
 * The served OpenAPI document declares `servers: [{ url: "/integration" }]`, but
 * the API is reverse-proxied under the same mount as the spec document itself:
 * the spec at `/proxy/network/api-docs/integration.json` implies an API mount of
 * `/proxy/network/integration`. Strict OpenAPI resolution of the root-relative
 * server URL would drop the `/proxy/network` mount (yielding `/integration`,
 * which the console serves as its web-UI HTML fallback). We recover the mount
 * from the spec URL and prepend it to the declared server base.
 */
export const apiBasePath = (specUrl: string, serverBasePath: string): string => {
  const path = new URL(specUrl).pathname;
  const marker = "/api-docs/";
  const idx = path.indexOf(marker);
  const mount = idx >= 0 ? path.slice(0, idx) : path.replace(/\/[^/]*$/, "");
  const combined = `${mount}${serverBasePath}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return combined === "" ? "/" : combined;
};

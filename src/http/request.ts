import { Agent } from "undici";
import { UnifiApiError, UnifiAuthError, UnifiTransportError } from "./errors.js";

export type RequestInput = {
  url: URL;
  method: string;
  apiKey: string;
  timeoutMs: number;
  insecureTls: boolean;
  caCert?: string;
  body?: unknown;
  operationId?: string;
  fetcher?: typeof fetch;
};

// Memoise dispatchers so we don't build a new undici Agent per request.
// Default (no CA, not insecure) → undefined → normal TLS verification.
const agents = new Map<string, Agent>();
const dispatcherFor = (insecureTls: boolean, caCert?: string): Agent | undefined => {
  if (!caCert && !insecureTls) return undefined;
  const key = caCert ? `ca:${caCert}` : "insecure";
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent(
      caCert ? { connect: { ca: caCert } } : { connect: { rejectUnauthorized: false } },
    );
    agents.set(key, agent);
  }
  return agent;
};

export const request = async <T>(input: RequestInput): Promise<T> => {
  const { url, method, apiKey, timeoutMs, insecureTls, caCert, body, operationId } = input;
  const fetcher = input.fetcher ?? fetch;
  const opId = operationId ?? `${method} ${url.pathname}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Only attach a custom dispatcher when using the real fetch (undici).
  // Injected test fetchers receive plain RequestInit.
  const dispatcher = input.fetcher ? undefined : dispatcherFor(insecureTls, caCert);
  // Cast through unknown: undici@8.6.0 bundles its own types which differ
  // slightly from undici-types@8.3.0 used by Node's RequestInit.dispatcher.
  // The runtime shape is correct; the cast resolves the structural mismatch.
  const init = {
    method,
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    signal: controller.signal,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(dispatcher !== undefined ? { dispatcher } : {}),
  };

  let response: Response;
  try {
    response = await fetcher(url, init as unknown as RequestInit);
  } catch (cause) {
    clearTimeout(timer);
    const m =
      cause instanceof Error ? `HTTP request failed: ${cause.message}` : "HTTP request failed";
    throw new UnifiTransportError(m, { cause });
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    throw new UnifiAuthError(`Authentication failed (${response.status}) — check UNIFI_API_KEY`, {
      status: response.status,
    });
  }

  const peek = response.clone();
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    let snippet = "";
    try {
      snippet = (await peek.text()).slice(0, 200).replace(/\s+/g, " ").trim();
    } catch {
      // clone body unreadable — ignore
    }
    const ct = response.headers.get("content-type") ?? "unknown";
    throw new UnifiTransportError(
      `Response was not valid JSON (content-type: ${ct}).${snippet ? ` body starts with: ${snippet}` : ""}`,
      { cause },
    );
  }

  if (!response.ok) {
    const detail =
      parsed !== null && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : response.statusText;
    throw new UnifiApiError(`${opId} failed: ${detail}`, {
      operationId: opId,
      status: response.status,
    });
  }

  return parsed as T;
};

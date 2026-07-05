import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dereference as openapiDereference } from "@readme/openapi-parser";
import type { Config } from "../config.js";
import { request } from "../http/request.js";
import { SpecStore, type SpecStoreDeps } from "./store.js";

const BUNDLED = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "spec",
  "integration.bundled.json",
);

export const createSpecStore = (cfg: Config): SpecStore => {
  const cacheFile = join(cfg.cacheDir, "integration-spec.json");

  const deps: SpecStoreDeps = {
    now: () => Date.now(),
    readCache: async () => {
      try {
        return JSON.parse(await readFile(cacheFile, "utf8")) as {
          fetchedAt: number;
          doc: unknown;
        };
      } catch {
        return undefined;
      }
    },
    writeCache: async (entry) => {
      await mkdir(cfg.cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(entry));
    },
    fetchLive: async () =>
      request<unknown>({
        url: new URL(cfg.specUrl),
        method: "GET",
        apiKey: cfg.apiKey,
        timeoutMs: cfg.timeoutMs,
        insecureTls: cfg.insecureTls,
        ...(cfg.caCert !== undefined ? { caCert: cfg.caCert } : {}),
        operationId: "fetchSpec",
      }),
    readBundled: async () => JSON.parse(await readFile(cfg.specFile ?? BUNDLED, "utf8")),
    dereference: async (doc) => openapiDereference(structuredClone(doc) as never),
  };

  return new SpecStore(cfg.specFreshnessMs, cfg.specUrl, deps);
};

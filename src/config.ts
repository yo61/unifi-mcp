import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { asApiKey, type ApiKey } from "./brands.js";

const LogLevel = z.enum(["error", "warn", "info", "debug"]);

const positiveInt = (fallback: number) =>
  z
    .string()
    .default(String(fallback))
    .transform((s, ctx) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message: "must be a positive integer" });
        return z.NEVER;
      }
      return n;
    });

const EnvSchema = z.object({
  UNIFI_BASE_URL: z.url({ error: "UNIFI_BASE_URL must be a valid URL" }),
  UNIFI_API_KEY: z
    .string({ error: "UNIFI_API_KEY is required" })
    .min(1, "UNIFI_API_KEY must not be empty"),
  UNIFI_SPEC_URL: z.string().optional(),
  UNIFI_SPEC_FILE: z.string().optional(),
  UNIFI_SPEC_FRESHNESS_MS: positiveInt(86_400_000),
  UNIFI_CACHE_DIR: z.string().default(join(homedir(), ".cache", "unifi-mcp")),
  UNIFI_TIMEOUT_MS: positiveInt(30_000),
  UNIFI_CA_CERT: z.string().optional(),
  UNIFI_INSECURE_TLS: z.string().default("false"),
  UNIFI_ALLOW_WRITES: z.string().default("false"),
  UNIFI_LOG_LEVEL: LogLevel.default("error"),
});

export type Config = {
  baseUrl: URL;
  apiKey: ApiKey;
  specUrl: string;
  specFile?: string;
  specFreshnessMs: number;
  cacheDir: string;
  timeoutMs: number;
  caCert?: string;
  insecureTls: boolean;
  allowWrites: boolean;
  logLevel: z.infer<typeof LogLevel>;
};

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration — ${message}`);
  }
  const d = parsed.data;
  const baseUrl = new URL(d.UNIFI_BASE_URL);

  let caCert: string | undefined;
  if (d.UNIFI_CA_CERT !== undefined) {
    try {
      caCert = readFileSync(d.UNIFI_CA_CERT, "utf8");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Invalid configuration — UNIFI_CA_CERT: cannot read CA certificate at '${d.UNIFI_CA_CERT}': ${reason}`,
        { cause },
      );
    }
  }

  return {
    baseUrl,
    apiKey: asApiKey(d.UNIFI_API_KEY),
    specUrl:
      d.UNIFI_SPEC_URL ?? new URL("/proxy/network/api-docs/integration.json", baseUrl).toString(),
    ...(d.UNIFI_SPEC_FILE !== undefined ? { specFile: d.UNIFI_SPEC_FILE } : {}),
    specFreshnessMs: d.UNIFI_SPEC_FRESHNESS_MS,
    cacheDir: d.UNIFI_CACHE_DIR,
    timeoutMs: d.UNIFI_TIMEOUT_MS,
    ...(caCert !== undefined ? { caCert } : {}),
    insecureTls: d.UNIFI_INSECURE_TLS === "true",
    allowWrites: d.UNIFI_ALLOW_WRITES === "true",
    logLevel: d.UNIFI_LOG_LEVEL,
  };
};

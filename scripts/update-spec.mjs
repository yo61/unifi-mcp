#!/usr/bin/env node
// Refreshes spec/integration.bundled.json — the layer-3 fallback of SpecStore.
// Source: community OpenAPI mirror (Ubiquiti serves the live spec per-gateway
// at /proxy/network/api-docs/integration.json but publishes no static URL).
import { writeFileSync } from "node:fs";
import YAML from "yaml";

const SRC =
  process.env.UNIFI_SPEC_SOURCE ??
  "https://raw.githubusercontent.com/tmcpro/unifi-network-api/main/openapi/openapi.yaml";

const res = await fetch(SRC);
if (!res.ok) throw new Error(`update-spec: ${res.status} fetching ${SRC}`);
const rawText = await res.text();
// The upstream YAML contains malformed double-quoted scalars where the closing
// " appears at column 1 on the next line rather than on the same line.  The JS
// yaml parser rejects these even in lenient mode, so we normalise them first.
const cleanedText = rawText.replace(/^(\s+source: "[^"]*)\n"$/gm, '$1"');
const spec = YAML.parse(cleanedText, { strict: false, logLevel: "silent", uniqueKeys: false });
writeFileSync("spec/integration.bundled.json", `${JSON.stringify(spec, null, 2)}\n`);
process.stderr.write(
  `update-spec: wrote ${spec.paths ? Object.keys(spec.paths).length : 0} paths\n`,
);

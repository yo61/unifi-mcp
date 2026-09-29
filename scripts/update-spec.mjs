#!/usr/bin/env node
// Refreshes spec/integration.bundled.json — the layer-3 fallback of SpecStore.
// Source: community OpenAPI mirror (Ubiquiti serves the live spec per-gateway
// at /proxy/network/api-docs/integration.json but publishes no static URL).
//
// The mirror is pinned to a commit, not a branch, and its bytes are checked
// against SPEC_SHA256 before parsing. To take a newer upstream: move SPEC_REF,
// run, read the diff the mismatch reports, then paste the digest it prints.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import YAML from "yaml";

const SPEC_REPO = "tmcpro/unifi-network-api";
const SPEC_REF = "71bc0572d752a910196ffaeccf561529e26fe607";
const SPEC_PATH = "openapi/openapi.yaml";
const SPEC_SHA256 = "0f2a324ae03a65a60c60fa652a5b4f1abe41d3d3e6981d4d4add366ef55c33a0";

const SRC = `https://raw.githubusercontent.com/${SPEC_REPO}/${SPEC_REF}/${SPEC_PATH}`;

const res = await fetch(SRC);
if (!res.ok) throw new Error(`update-spec: ${res.status} fetching ${SRC}`);
const rawBytes = new Uint8Array(await res.arrayBuffer());
const digest = createHash("sha256").update(rawBytes).digest("hex");
if (digest !== SPEC_SHA256) {
  throw new Error(
    [
      `update-spec: integrity check failed for ${SRC}`,
      `  expected ${SPEC_SHA256}`,
      `  actual   ${digest}`,
      "A pinned commit cannot change, so this means the ref moved or the",
      "mirror was rewritten. Review the upstream diff before updating",
      "SPEC_SHA256 — this file drives the MCP tool surface.",
    ].join("\n"),
  );
}
const rawText = new TextDecoder().decode(rawBytes);
// The upstream YAML contains malformed double-quoted scalars where the closing
// " appears at column 1 on the next line rather than on the same line.  The JS
// yaml parser rejects these even in lenient mode, so we normalise them first.
const cleanedText = rawText.replace(/^(\s+source: "[^"]*)\n"$/gm, '$1"');
const spec = YAML.parse(cleanedText, { strict: false, logLevel: "silent", uniqueKeys: false });
writeFileSync("spec/integration.bundled.json", `${JSON.stringify(spec, null, 2)}\n`);
process.stderr.write(
  `update-spec: wrote ${spec.paths ? Object.keys(spec.paths).length : 0} paths\n`,
);

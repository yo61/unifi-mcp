# Release Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `unifi-mcp` the yo61 "house" CI/release process — CI, prek hooks, commitlint, release-please, npm OIDC publishing as `@robinbowes/unifi-mcp`, supply-chain scanning, an AI review workflow, dependabot, a Taskfile, and `decisions/`/`quality/` dirs.

**Architecture:** GitHub Actions workflows driven by a go-task `Taskfile` that wraps the existing pnpm scripts, plus release-please for automated versioning/publishing. Modelled on `../go-udap` and `../jobhound`; designed to backport to `civi-mcp`.

**Tech Stack:** GitHub Actions, go-task, release-please, commitlint, prek, osv-scanner, syft/grype, pnpm, npm OIDC trusted publishing.

## Global Constraints

- **Package name:** `@robinbowes/unifi-mcp` (scoped); `bin` stays `unifi-mcp`.
- **Node matrix:** 22 and 24 (`engines: >=22`).
- **Every third-party action pinned to a full commit SHA** with a `# vX.Y.Z` comment; `persist-credentials: false` on checkout; least-privilege `permissions:` per workflow/job. `zizmor` MUST pass on every workflow.
- **Known-good pinned SHAs** (from `../jobhound` / `../go-udap`, current) — reuse verbatim:
  - `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2`
  - `actions/create-github-app-token@1b10c78c7865c340bc4f6099eb2f838309f1e8c3 # v3.1.1`
  - `googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0`
  - `go-task/setup-task@3be4020d41929789a01026e0e427a4321ce0ad44 # v2.0.0`
  - `wagoid/commitlint-github-action@b948419dd99f3fd78a6548d48f94e3df7f6bf3ed # v6.2.1`
  - `zizmorcore/zizmor-action@192e21d79ab29983730a13d1382995c2307fbcaa # v0.5.7`
  - `anthropics/claude-code-action@51ea8ea73a139f2a74ff649e3092c25a904aed7e # v1.0.123`
  - `github/codeql-action/upload-sarif@54f647b7e1bb85c95cddabcd46b0c578ec92bc1a # v4.36.3`
- **Actions needing a fresh SHA pin** (not in the reference repos) — for each, resolve the SHA of the named version tag with `gh api /repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha` (deref annotated tags with a second call on the returned sha if needed) and pin it with a `# <tag>` comment:
  - `pnpm/action-setup` (target `v4`)
  - `actions/setup-node` (target `v4`)
  - `google/osv-scanner-action` (target its current release, e.g. `v2.x`)
  - `anchore/sbom-action` (current) · `anchore/scan-action` (current)
  - `softprops/action-gh-release` — NOT used (release-please creates the release)
- **Secrets available:** `SEMANTIC_RELEASE_APP_CLIENT_ID` / `SEMANTIC_RELEASE_APP_PRIVATE_KEY` (org secrets, ALL repos). `CLAUDE_CODE_OAUTH_TOKEN` is NOT yet set (Robin adds it) — the Claude workflow must be written so a missing token skips rather than fails.
- **npm publish = `npm publish` (not `pnpm publish`)** for OIDC trusted-publishing support; requires npm ≥ 11.5 (`npm install -g npm@latest` in the publish job) and `id-token: write`.
- **Tooling the implementer needs locally:** `task` (go-task — `brew install go-task/tap/go-task`), `actionlint`, `zizmor`, `prek`. Validate each workflow with `actionlint <file>` and `zizmor <file>` before committing.
- **Commits:** conventional-commit prefixes; sign commits (`commit.gpgsign` is true in this repo); end message bodies with the Co-Authored-By trailer. Work stays on branch `feat/release-engineering`.

---

## File Structure

```
package.json                              # name → @robinbowes/unifi-mcp, publishConfig, repository/homepage/bugs
README.md                                 # install name
Taskfile.yml                              # go-task wrapping pnpm
commitlint.config.mjs                     # conventional commits config
.pre-commit-config.yaml                   # (existing) + actionlint + zizmor hooks
release-please-config.json                # release-please config
.release-please-manifest.json             # version manifest
.github/
  workflows/
    ci.yml                                # check matrix + commitlint + zizmor
    release.yml                           # release-please + npm OIDC publish
    security.yml                          # osv-scanner + syft/grype SBOM
    claude-code-review.yml                # AI review on PRs
  dependabot.yml                          # npm + github-actions + pre-commit
decisions/2026-07-05-release-engineering.md
quality/criteria.md
```

---

### Task 1: Package identity

**Files:**
- Modify: `package.json`, `README.md`

**Interfaces:**
- Produces: published package name `@robinbowes/unifi-mcp`; `publishConfig` enabling public+provenance publish. Later tasks (release-please config, publish job) reference this exact name.

- [ ] **Step 1: Update `package.json` identity fields**

Set `"name": "@robinbowes/unifi-mcp"`. Add (top level, near `license`):
```jsonc
  "repository": { "type": "git", "url": "git+https://github.com/yo61/unifi-mcp.git" },
  "homepage": "https://github.com/yo61/unifi-mcp#readme",
  "bugs": { "url": "https://github.com/yo61/unifi-mcp/issues" },
  "publishConfig": { "access": "public", "provenance": true },
```
Leave `bin`, `version` (0.1.0), `files`, `scripts`, deps unchanged.

- [ ] **Step 2: Update the README install name**

In `README.md`, change any `npm install`/`npx` reference from `unifi-mcp` to `@robinbowes/unifi-mcp`. Leave the `unifi-mcp` **command** name (from `bin`) as-is; add a one-line note that the CLI command is `unifi-mcp` even though the package is scoped.

- [ ] **Step 3: Verify**

Run: `pnpm verify`
Expected: green (name change doesn't affect build/tests). Also `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` → no error.

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: publish as scoped @robinbowes/unifi-mcp

The unscoped unifi-mcp npm name is owned by a third party. Bin/CLI
command is unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Taskfile + commitlint + hooks

**Files:**
- Create: `Taskfile.yml`, `commitlint.config.mjs`
- Modify: `.pre-commit-config.yaml`

**Interfaces:**
- Produces: `task dev:check` (used by CI Task 3), `task smoke`, `task hooks-install`. commitlint config (used by CI Task 3 and the commit-msg hook).

- [ ] **Step 1: Write `Taskfile.yml`**

```yaml
version: "3"
silent: true

tasks:
  default:
    desc: List available tasks
    cmds:
      - task --list

  dev:fmt:
    desc: Apply oxfmt
    cmds:
      - pnpm format

  dev:fmt-check:
    desc: Check formatting without rewriting
    cmds:
      - pnpm format:check

  dev:lint:
    desc: Run oxlint
    cmds:
      - pnpm lint

  dev:typecheck:
    desc: Run tsc --noEmit
    cmds:
      - pnpm typecheck

  dev:test:
    desc: Run the vitest suite
    cmds:
      - pnpm test

  dev:check:
    desc: Full quality gate — format-check, lint, typecheck, tests
    cmds:
      - task: dev:fmt-check
      - task: dev:lint
      - task: dev:typecheck
      - task: dev:test

  smoke:
    desc: Read-only smoke test against a live controller (.env)
    cmds:
      - pnpm smoke

  update-spec:
    desc: Refresh the bundled OpenAPI spec
    cmds:
      - pnpm update-spec

  hooks:
    desc: Run all prek hooks against every file
    cmds:
      - prek run --all-files

  hooks-install:
    desc: Install git hooks (pre-commit, commit-msg, pre-push)
    cmds:
      - prek install --hook-type pre-commit --hook-type commit-msg --hook-type pre-push
```

- [ ] **Step 2: Write `commitlint.config.mjs`**

```js
export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot's bodies contain long unwrapped URLs that exceed body-max-line-length.
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
  rules: {
    // Allow class names / acronyms in subjects (e.g. "EntityIndex handles",
    // "MCP tools use"). The default ruleset rejects these cases.
    "subject-case": [0],
  },
};
```

- [ ] **Step 3: Add actionlint + zizmor to `.pre-commit-config.yaml`**

Append these repos to the existing `.pre-commit-config.yaml` (keep everything already there):
```yaml
  - repo: https://github.com/rhysd/actionlint
    rev: v1.7.7
    hooks:
      - id: actionlint
  - repo: https://github.com/woodruffw/zizmor-pre-commit
    rev: v1.14.2
    hooks:
      - id: zizmor
```
(Resolve the current `rev:` tag for each at install time if newer; prek/pre-commit pins by tag here, not SHA — dependabot's `pre-commit` ecosystem keeps them current.)

- [ ] **Step 4: Verify**

Run: `task dev:check`
Expected: format-check, lint, typecheck, tests all pass (same as `pnpm verify`).
Run: `prek run --all-files`
Expected: all hooks pass (or auto-fix formatting; re-run clean). If `task` is not installed: `brew install go-task/tap/go-task`.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml commitlint.config.mjs .pre-commit-config.yaml
git commit -m "build: add Taskfile, commitlint, and actionlint/zizmor hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `task dev:check` (Task 2), `commitlint.config.mjs` (Task 2).
- Produces: the required status checks that gate PRs.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    name: check (node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ["22", "24"]
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@<PIN v4> # resolve SHA
      - uses: actions/setup-node@<PIN v4> # resolve SHA
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - uses: go-task/setup-task@3be4020d41929789a01026e0e427a4321ce0ad44 # v2.0.0
        with:
          version: 3.x
      - run: pnpm install --frozen-lockfile
      - run: task dev:check

  commitlint:
    name: Conventional Commits
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read # required for checkout — job-level permissions do not inherit the top-level default
      pull-requests: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: wagoid/commitlint-github-action@b948419dd99f3fd78a6548d48f94e3df7f6bf3ed # v6.2.1
        with:
          configFile: commitlint.config.mjs

  zizmor:
    name: zizmor
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - uses: zizmorcore/zizmor-action@192e21d79ab29983730a13d1382995c2307fbcaa # v0.5.7
```

- [ ] **Step 2: Resolve the two `<PIN>` SHAs**

For `pnpm/action-setup` and `actions/setup-node`, resolve and substitute the real SHA:
```bash
gh api /repos/pnpm/action-setup/git/ref/tags/v4 --jq '.object.sha'
gh api /repos/actions/setup-node/git/ref/tags/v4 --jq '.object.sha'
```
Replace `<PIN v4>` with `<sha> # v4`. (If the tag is annotated, the returned sha is the tag object — deref with `gh api /repos/OWNER/REPO/git/tags/<sha> --jq .object.sha`.)

- [ ] **Step 3: Validate**

Run: `actionlint .github/workflows/ci.yml && zizmor .github/workflows/ci.yml`
Expected: no findings. No `<PIN>` markers remain (`grep -n PIN .github/workflows/ci.yml` → empty).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow (node 22/24 matrix, commitlint, zizmor)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: release-please config + Release workflow

**Files:**
- Create: `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: package name `@robinbowes/unifi-mcp` (Task 1).
- Produces: automated Release PRs, GitHub Releases, and npm publishing.

- [ ] **Step 1: Write `release-please-config.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-v-in-tag": true,
  "include-component-in-tag": false,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "packages": {
    ".": {
      "package-name": "@robinbowes/unifi-mcp",
      "changelog-path": "CHANGELOG.md",
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance Improvements" },
        { "type": "deps", "section": "Dependencies" },
        { "type": "revert", "section": "Reverts" },
        { "type": "docs", "section": "Documentation" },
        { "type": "refactor", "section": "Code Refactoring" },
        { "type": "style", "hidden": true },
        { "type": "test", "hidden": true },
        { "type": "build", "hidden": true },
        { "type": "ci", "hidden": true },
        { "type": "chore", "hidden": true }
      ]
    }
  }
}
```

- [ ] **Step 2: Write `.release-please-manifest.json`**

```json
{ ".": "0.1.0" }
```
The current `package.json` version is `0.1.0` and `@robinbowes/unifi-mcp` is unpublished, so the first Release PR cuts the next version after `0.1.0` based on commits (a `feat:` → `0.2.0` given `bump-minor-pre-major`). If you want the very first published version to be exactly `0.1.0`, set this manifest to `"0.0.0"` and add a `"Release-As: 0.1.0"` note in one commit body before the first release; otherwise accept the computed bump. Record which you chose in the commit message.

- [ ] **Step 3: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: release-please
  cancel-in-progress: false

jobs:
  release-please:
    runs-on: ubuntu-latest
    if: github.repository_owner == 'yo61'
    permissions:
      contents: read
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      # App token so the Release PR is authored by the App and triggers
      # pull_request CI (a plain GITHUB_TOKEN would not).
      - id: token
        uses: actions/create-github-app-token@1b10c78c7865c340bc4f6099eb2f838309f1e8c3 # v3.1.1
        with:
          client-id: ${{ secrets.SEMANTIC_RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.SEMANTIC_RELEASE_APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}
          repositories: ${{ github.event.repository.name }}
          permission-contents: write
          permission-pull-requests: write
      - uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7 # v5.0.0
        id: rp
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
          token: ${{ steps.token.outputs.token }}

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    environment:
      name: npm
      url: https://www.npmjs.com/package/@robinbowes/unifi-mcp
    permissions:
      id-token: write # npm OIDC trusted publishing
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          ref: ${{ needs.release-please.outputs.tag_name }}
          persist-credentials: false
      - uses: pnpm/action-setup@<PIN v4> # resolve SHA (same as CI)
      - uses: actions/setup-node@<PIN v4> # resolve SHA
        with:
          node-version: "24"
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      # npm >= 11.5 required for OIDC trusted publishing.
      - run: npm install -g npm@latest
      - run: npm publish --provenance --access public
```

Notes: `npm publish` (not `pnpm publish`) is used for OIDC trusted-publishing support; it triggers `prepublishOnly` (`pnpm verify && pnpm build`), which is why pnpm+node are set up in this job. No `NODE_AUTH_TOKEN` — npm authenticates via OIDC against the trusted publisher Robin configures on npmjs.

- [ ] **Step 4: Resolve `<PIN>` SHAs (reuse the values from Task 3) and validate**

Run: `grep -n PIN .github/workflows/release.yml` → empty after substitution.
Run: `actionlint .github/workflows/release.yml && zizmor .github/workflows/release.yml`
Expected: no findings.

- [ ] **Step 5: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release.yml
git commit -m "ci: add release-please and npm OIDC publish workflow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Security workflow

**Files:**
- Create: `.github/workflows/security.yml`

**Interfaces:**
- Produces: vuln + SBOM scan results in the Security tab.

- [ ] **Step 1: Write `.github/workflows/security.yml`**

```yaml
name: Security

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  osv-scan:
    name: osv-scanner
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - id: osv
        continue-on-error: true
        uses: google/osv-scanner-action/osv-scanner-action@<PIN current> # resolve SHA — action lives in the /osv-scanner-action subdir, not repo root
        with:
          scan-args: |-
            --lockfile=pnpm-lock.yaml
            --format=sarif
            --output=osv.sarif
      - if: always() && github.event_name != 'pull_request'
        uses: github/codeql-action/upload-sarif@54f647b7e1bb85c95cddabcd46b0c578ec92bc1a # v4.36.3
        with:
          sarif_file: osv.sarif
          category: osv-scanner
      - if: steps.osv.outcome == 'failure'
        run: |
          echo "::error::osv-scanner reported vulnerabilities. See the Security tab."
          exit 1

  sbom-scan:
    name: sbom-scan
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - id: sbom
        uses: anchore/sbom-action@<PIN current> # resolve SHA
        with:
          format: cyclonedx-json
          output-file: sbom.cdx.json
          artifact-name: sbom.cdx.json
      - id: grype
        continue-on-error: true
        uses: anchore/scan-action@<PIN current> # resolve SHA
        with:
          sbom: sbom.cdx.json
          fail-build: true
          severity-cutoff: high
          output-format: sarif
      - if: always() && github.event_name != 'pull_request'
        uses: github/codeql-action/upload-sarif@54f647b7e1bb85c95cddabcd46b0c578ec92bc1a # v4.36.3
        with:
          sarif_file: ${{ steps.grype.outputs.sarif }}
          category: grype
      - if: steps.grype.outcome == 'failure'
        run: |
          echo "::error::grype found severity >= HIGH. See the Security tab."
          exit 1
```

- [ ] **Step 2: Resolve the three `<PIN current>` SHAs**

```bash
gh api /repos/google/osv-scanner-action/releases/latest --jq '.tag_name'   # then resolve its SHA
gh api /repos/anchore/sbom-action/releases/latest --jq '.tag_name'
gh api /repos/anchore/scan-action/releases/latest --jq '.tag_name'
```
Pin each to the SHA of that tag (`gh api /repos/<owner>/<repo>/git/ref/tags/<tag> --jq .object.sha`). Confirm the input keys (`scan-args`, `sbom`, `severity-cutoff`, `output-format`, and the `sarif` output name) match that version's action.yml; adjust if the action's interface differs, and note any change.

- [ ] **Step 3: Validate**

Run: `grep -n PIN .github/workflows/security.yml` → empty.
Run: `actionlint .github/workflows/security.yml && zizmor .github/workflows/security.yml`
Expected: no findings.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci: add supply-chain security scanning (osv-scanner + syft/grype)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Claude review workflow + Dependabot

**Files:**
- Create: `.github/workflows/claude-code-review.yml`, `.github/dependabot.yml`

**Interfaces:**
- Produces: AI review on PRs (inert until `CLAUDE_CODE_OAUTH_TOKEN` is set); grouped dependency updates.

- [ ] **Step 1: Write `.github/workflows/claude-code-review.yml`**

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]

jobs:
  claude-review:
    # Skip dependabot (its sandboxed secrets don't expose the token) and skip
    # entirely when the token secret is absent, so the workflow is inert until
    # CLAUDE_CODE_OAUTH_TOKEN is added rather than failing.
    if: >-
      github.actor != 'dependabot[bot]' &&
      vars.CLAUDE_REVIEW_ENABLED == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 1
          persist-credentials: false
      - uses: anthropics/claude-code-action@51ea8ea73a139f2a74ff649e3092c25a904aed7e # v1.0.123
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          allowed_bots: "semantic-release-pusher"
```

Note the `vars.CLAUDE_REVIEW_ENABLED == 'true'` gate: the job stays skipped until Robin sets both the `CLAUDE_CODE_OAUTH_TOKEN` secret and a repo/org **variable** `CLAUDE_REVIEW_ENABLED=true`. Document this in the decision record (Task 7).

- [ ] **Step 2: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    groups:
      npm:
        patterns: ["*"]
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    groups:
      actions:
        patterns: ["*"]
  - package-ecosystem: pre-commit
    directory: "/"
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    groups:
      hooks:
        patterns: ["*"]
```

- [ ] **Step 3: Validate**

Run: `actionlint .github/workflows/claude-code-review.yml && zizmor .github/workflows/claude-code-review.yml`
Expected: no findings.
Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml'))"` (or `yq`) → no error.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/claude-code-review.yml .github/dependabot.yml
git commit -m "ci: add Claude review workflow and dependabot config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Standards dirs

**Files:**
- Create: `decisions/2026-07-05-release-engineering.md`, `quality/criteria.md`

**Interfaces:**
- Produces: the decision record + quality criteria per the global CLAUDE.md conventions. Documents the manual setup steps Robin must complete.

- [ ] **Step 1: Write `decisions/2026-07-05-release-engineering.md`**

```markdown
## Decision: Adopt the yo61 house CI/release process for unifi-mcp

## Context: unifi-mcp had no CI/release automation. The MVP plan deferred it to its own cycle.

## Alternatives considered:
- Minimal CI only (lint/test) — rejected; we want the full backportable process.
- Hand-rolled tag-triggered release with NPM_TOKEN — rejected in favour of release-please + OIDC (no stored token, provenance).
- pnpm publish — rejected for the publish step; npm CLI is used for OIDC trusted-publishing support.

## Reasoning: Reuse the battle-tested go-udap/jobhound process; develop it here and backport to civi-mcp.

## Trade-offs accepted: More moving parts; two manual setup steps (npm trusted publisher; CLAUDE_CODE_OAUTH_TOKEN).

## Manual setup required (owner: Robin):
1. npmjs: create a **trusted publisher** for package @robinbowes/unifi-mcp → repo yo61/unifi-mcp, workflow release.yml.
2. Add repo (or org) secret `CLAUDE_CODE_OAUTH_TOKEN` and variable `CLAUDE_REVIEW_ENABLED=true` to enable AI review.
3. (When ready) enable branch protection on main requiring the CI `check` statuses.

## Supersedes: none.
```

- [ ] **Step 2: Write `quality/criteria.md`**

```markdown
## Category: Release hygiene
## Criteria:
    - Every workflow action is pinned to a full commit SHA with a version comment (zizmor enforces).
    - Conventional-commit types drive the CHANGELOG; no manual version edits.
    - Published package has provenance (npm --provenance via OIDC).
## Severity: blocking
## Source: release-engineering design 2026-07-05
## Last triggered: never

## Category: Security
## Criteria:
    - No dependency with a known vuln reachable in pnpm-lock.yaml (osv-scanner).
    - No SBOM component with severity >= HIGH (grype).
    - Secrets never logged; TLS verification on by default.
## Severity: blocking
## Source: release-engineering design 2026-07-05
## Last triggered: never
```

- [ ] **Step 3: Verify markdownlint + commit**

Run: `prek run markdownlint-cli2 --all-files` (or `pnpm exec markdownlint-cli2 "decisions/**" "quality/**"`) — fix any findings.
```bash
git add decisions quality
git commit -m "docs: add release-engineering decision record and quality criteria

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Package identity (§1) → Task 1 ✓
- Taskfile (§2) → Task 2 ✓
- prek hooks + actionlint/zizmor (§3) → Task 2 ✓
- commitlint (§4) → Task 2 ✓
- CI (§5) → Task 3 ✓
- Release + npm OIDC publish (§6) → Task 4 ✓
- Security (§7) → Task 5 ✓
- Claude review (§8) → Task 6 ✓
- Dependabot (§9) → Task 6 ✓
- Standards dirs (§10) → Task 7 ✓
- release-please config (§11) → Task 4 ✓
- Decisions (Node matrix, security tooling, Taskfile-wraps-pnpm, MCPB-out) → reflected in Tasks 3/5/2 and the decision record (Task 7) ✓

**Placeholder scan:** The `<PIN …>` markers are intentional and each carries an explicit `gh api` resolution command + a `grep -n PIN` gate + zizmor enforcement, per the Global Constraints. The `.release-please-manifest.json` seed choice is presented as an explicit either/or with a recorded decision. No silent TODOs.

**Type/name consistency:** `@robinbowes/unifi-mcp` used identically in Task 1 (package.json), Task 4 (release-please `package-name`, publish `environment.url`), and Task 7. `task dev:check` defined in Task 2, consumed in Task 3. The known-good action SHAs in Global Constraints are reused verbatim across Tasks 3/4/5/6. `CLAUDE_CODE_OAUTH_TOKEN` + `CLAUDE_REVIEW_ENABLED` handling consistent between Task 6 and the Task 7 decision record.
```

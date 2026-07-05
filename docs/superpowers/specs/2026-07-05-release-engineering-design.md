# Release engineering — design

**Date:** 2026-07-05
**Status:** Approved design, pre-implementation
**Issue:** [#2](https://github.com/yo61/unifi-mcp/issues/2)
**Related:** `../go-udap`, `../jobhound` (the reference implementations of the
"house" process); intended to backport to `civi-mcp`.

## Summary

Adopt the yo61 "house" CI/release process — modelled on `go-udap` and
`jobhound` — for `unifi-mcp`, which currently has no `.github/` at all. The
result: CI on every push/PR, conventional-commit enforcement, automated
releases (release-please), npm publishing via OIDC trusted publishing,
supply-chain scanning, an AI review workflow, and the `decisions/`/`quality/`
standards dirs. Designed to be generic enough that lifting it to `civi-mcp` is
mostly find-replace.

## Goals

- CI gate (lint/format/typecheck/test) on every push to `main` and every PR.
- Conventional commits enforced (commitlint) in CI and via hooks.
- Automated versioning, CHANGELOG, tags, and GitHub Releases (release-please).
- Publish to npm as `@robinbowes/unifi-mcp` via OIDC trusted publishing
  (provenance, no stored token).
- Supply-chain scanning (vuln + SBOM) with results in the GitHub Security tab.
- AI code review on PRs.
- A task runner (go-task) so CI and local dev run the same commands.
- Portable: everything except the package name and Node-specifics backports to
  `civi-mcp`.

## Non-goals (this cycle)

- The MCPB (`.mcpb`) bundle for Claude Desktop — tracked separately as
  [#7](https://github.com/yo61/unifi-mcp/issues/7).
- Fixing the open code-quality issues ([#5](https://github.com/yo61/unifi-mcp/issues/5),
  [#6](https://github.com/yo61/unifi-mcp/issues/6)) — orthogonal.

## Prerequisites (validated 2026-07-05)

| Prerequisite | State | Action |
| --- | --- | --- |
| `semantic-release-pusher` GitHub App | ✅ Installed org-wide; `SEMANTIC_RELEASE_APP_CLIENT_ID`/`_PRIVATE_KEY` are **org secrets scoped to ALL repos** | none — usable as-is |
| `CLAUDE_CODE_OAUTH_TOKEN` | ⚠️ Set only on `jobhound`; **absent from `unifi-mcp`** | Robin adds it as a repo secret (or promotes to org secret); workflow is inert until then |
| npm package name | `unifi-mcp` (unscoped) is owned by a third party (`pproenca-user`) | Publish as **`@robinbowes/unifi-mcp`** (Robin's user scope, unpublished/free) |
| npm OIDC trusted publisher | not configured | Robin adds a trusted publisher for repo `yo61/unifi-mcp` + workflow `release.yaml` on npmjs |

## Components

### 1. Package identity (`package.json`, `README.md`)

- `name` → `@robinbowes/unifi-mcp`.
- Add `publishConfig: { access: "public", provenance: true }` (scoped packages
  are private by default).
- Add `repository`, `homepage`, `bugs` (currently absent).
- `bin` stays `{ "unifi-mcp": "./dist/cli.js" }` — the CLI command is unchanged
  by the scope.
- README install instructions → `@robinbowes/unifi-mcp`.

### 2. Taskfile (`Taskfile.yml`)

go-task wraps the existing pnpm scripts (scripts remain the primitives; npm
lifecycle hooks like `prepublishOnly` stay in `package.json`). Tasks:
`dev:check` (format:check → lint → typecheck → test), `dev:fmt`, `dev:lint`,
`dev:typecheck`, `dev:test`, `smoke`, `update-spec`, `hooks`, `hooks-install`.
CI runs `task dev:check`.

### 3. Hooks — prek (`.pre-commit-config.yaml`)

Migrate from pre-commit to **prek** (reads the same config). Keep the existing
hooks (trailing-whitespace, end-of-file-fixer, markdownlint, conventional
commits, local oxfmt/oxlint/tsc/vitest); add `actionlint` and `zizmor`.
`task hooks-install` installs pre-commit + commit-msg + pre-push.

### 4. commitlint (`commitlint.config.mjs`)

`@commitlint/config-conventional`, `subject-case` relaxed (allow
class/acronym subjects), ignore dependabot's commits. Enforced by a CI job on
PRs and by the commit-msg hook.

### 5. CI (`.github/workflows/ci.yaml`)

Triggers: `push` to `main`, `pull_request`. Jobs:

- `check` — matrix over **Node 22 and 24**; `pnpm install --frozen-lockfile`
  then `task dev:check`.
- `commitlint` — on PRs; lints the PR's commits.
- `zizmor` — workflow static analysis.

All third-party actions pinned to full commit SHA with a version comment;
`persist-credentials: false` on checkout; least-privilege `permissions`.

### 6. Release (`.github/workflows/release.yaml`)

Trigger: `push` to `main`. Jobs:

- `release-please` — `release-type: node`, using an App token minted from the
  `semantic-release-pusher` org secrets so the Release PR triggers
  `pull_request` CI (a plain `GITHUB_TOKEN` would not). Opens/updates a Release
  PR; merging it cuts the GitHub Release + tag.
- `publish` — gated on `release_created`. **npm OIDC trusted publishing**:
  `permissions: { id-token: write, contents: read }`, `setup-node` with the npm
  registry, `pnpm publish --provenance --access public --no-git-checks`. No
  `NPM_TOKEN` — npm authenticates via OIDC against the configured trusted
  publisher and records provenance.

No lockfile-sync job (unlike jobhound's `uv.lock`): `pnpm-lock.yaml` does not
carry the root package's own version, so release-please's `package.json` bump
does not desync it.

### 7. Security (`.github/workflows/security.yaml`)

Triggers: `push`/`pull_request`/daily `schedule`/`workflow_dispatch`. Jobs:

- `osv-scan` — `osv-scanner` over `pnpm-lock.yaml`; SARIF uploaded to the
  Security tab; fails on findings.
- `sbom-scan` — `syft` produces a CycloneDX SBOM (workflow artifact), `grype`
  scans it, fails on severity ≥ HIGH; SARIF uploaded. Mirrors go-udap.

`security-events: write` only on these jobs (for SARIF upload).

### 8. Claude review (`.github/workflows/claude-code-review.yaml`)

Trigger: `pull_request` (opened/synchronize/ready_for_review/reopened). Skips
`dependabot[bot]`. Uses `anthropics/claude-code-action` with
`CLAUDE_CODE_OAUTH_TOKEN` and the `code-review` plugin, running
`/code-review:code-review`. Allows the `semantic-release-pusher` bot so
release PRs get reviewed. Inert until the token secret is added.

### 9. Dependabot (`.github/dependabot.yaml`)

Ecosystems: `npm`, `github-actions`, `pre-commit`. Weekly, `cooldown:
default-days: 7`, grouped (`patterns: ["*"]` per ecosystem).

### 10. Standards dirs

- `decisions/2026-07-05-release-engineering.md` — the decision record for
  adopting the house process (context, alternatives, trade-offs), per the
  global CLAUDE.md decision-journal convention.
- `quality/criteria.md` — initial quality criteria for the project (API design,
  security, release hygiene), per the global CLAUDE.md quality-gate convention.

### 11. release-please config

- `release-please-config.json` — `release-type: node`, `package-name:
  @robinbowes/unifi-mcp`, `include-v-in-tag: true`, `changelog-sections`
  (Features/Bug Fixes/Performance/Dependencies/Reverts/Documentation/Refactor;
  style/test/build/ci/chore hidden), `bump-minor-pre-major: true`.
- `.release-please-manifest.json` — seeded so the first Release PR cuts
  `0.1.0` (the scoped package is unpublished). Exact seed value is an
  implementation detail (either `0.1.0` with the first release re-cutting it,
  or a `bootstrap-sha`), resolved in the plan.

## Decisions

- **Node matrix = 22 (LTS) + 24 (current)**, per `engines: >=22`.
- **Security tooling = osv-scanner + syft/grype** (go-udap parity, SARIF to the
  Security tab) rather than a lighter `pnpm audit` step.
- **Taskfile wraps pnpm scripts** rather than replacing them.
- **MCPB is out of scope** (issue #7).

## Verification

- `actionlint` and `zizmor` run clean over all workflows locally before
  commit (and in CI).
- Every third-party action is SHA-pinned; `zizmor` enforces this.
- CI proves itself on the first PR raised from this branch.
- Release/publish is proven on the first real Release PR merge; until the npm
  trusted publisher and `CLAUDE_CODE_OAUTH_TOKEN` are configured, the `publish`
  and `claude-review` jobs are expected to no-op/skip rather than fail the
  pipeline.

## Backport to civi-mcp

Everything here is portable except: the package name (`@robinbowes/unifi-mcp`
vs `civi-mcp`, which owns its unscoped name), and Node specifics (matrix,
pnpm). `civi-mcp` already uses the same toolchain (pnpm/oxlint/oxfmt/vitest)
and lacks CI entirely, so the workflows, Taskfile, commitlint, dependabot,
security, and standards dirs lift over with minimal change.

**Required for the backport (oxfmt × release-please):** `civi-mcp` uses the
same oxfmt formatter, which — unlike the single-language formatters in the
other house-process repos (jobhound's `ruff format`, go-udap's `go fmt`) —
also formats Markdown and JSON. release-please's generated `CHANGELOG.md` and
`.release-please-manifest.json` are therefore in oxfmt's scope and will fail
`oxfmt --check` on every Release PR. Add both to `.prettierignore` (as done
here). This does not affect the Python/Go repos and is specific to any
Prettier-family formatter.

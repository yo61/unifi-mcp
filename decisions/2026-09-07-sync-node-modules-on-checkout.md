## Decision: Re-sync node_modules from a prek post-checkout/merge/rewrite hook

Add a `language: system` prek hook running `pnpm install --frozen-lockfile` on
the `post-checkout`, `post-merge` and `post-rewrite` stages, and extend
`default_install_hook_types` so `prek install` wires the shims up.

## Context

A `git pull` that moved `package.json` and `pnpm-lock.yaml` left this checkout
with `@readme/openapi-parser` 7.0.1 installed while the lockfile said 8.0.1.
pnpm already guards the scripted path: with `verify-deps-before-run` at its
default, `pnpm <script>` re-installs before running (measured on pnpm 11.5.3 —
setting it to `false` runs against the stale tree, leaving it unset heals).
What is not covered is everything that resolves `node_modules` directly: the
editor's tsserver, ALE's oxlint, `node dist/cli.js`, and a fresh `wt switch`
worktree that has no `node_modules` at all.

## Alternatives considered

- Set `verifyDepsBeforeRun: install` in `pnpm-workspace.yaml` — a no-op today,
  since it restates the pnpm 11 default, and it still only covers `pnpm run`.
- Do nothing and rely on `pnpm run` self-healing — leaves editor tooling and
  the built server running against whatever was installed last.
- direnv hook in `.envrc` — `.envrc` is gitignored and per-machine, so the
  guard would not exist for anyone else.
- prek hook on post-checkout/merge/rewrite — chosen; it is in the repo, runs
  for every clone that ran `prek install`, and covers new worktrees.

## Reasoning

The failure is caused by a git operation, so the guard belongs on the git
operation rather than on one consumer of `node_modules`. git ignores the exit
status of these hooks, so a `package.json`/lockfile mismatch mid-rebase reports
itself without blocking the checkout. An already-synced tree costs ~150ms.

## Trade-offs accepted

`git worktree add` now pays a full install before handing back the prompt, and
every branch switch runs a short pnpm check. prek's shim does not inspect git's
third argument, so a file-level `git checkout -- <path>` pays the check too, and
a `git bisect run` pays a real install per step because older commits carry
older lockfiles — the ~150ms figure holds only when the tree is already in sync.

`task hooks-install` had to change with it: it named `--hook-type` flags
explicitly, and those override `default_install_hook_types`, so the new stages
would never have been installed by the documented path. The task now runs a bare
`prek install` and the config is the only place the list lives. Existing clones
still need to re-run it once; anyone who skips `prek install` gets no protection,
the same caveat that already applies to the pre-commit hooks.

## Supersedes: none

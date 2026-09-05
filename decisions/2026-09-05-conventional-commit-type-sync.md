## Decision: Duplicate the commit-type list into the pre-commit hook rather than restructure

`conventional-pre-commit` is given the accepted commit types explicitly as
`args`, duplicating the `type-enum` list in `commitlint.config.mjs`. The two
lists must now be kept in sync by hand, and a comment in
`.pre-commit-config.yaml` names the other file as the sync target.

## Context

`commitlint.config.mjs` deliberately adds `deps` to its `type-enum`.
release-please keys changelog sections by commit type, so `deps:` routes
dependency bumps to their own Dependencies section, whereas the default
`chore(deps)` would land under the hidden `chore` type.

The local `conventional-pre-commit` hook carried no `args`, so it fell back to
its own default type list, which does not include `deps`. The two gates
disagreed: a `deps:` commit that CI accepts was rejected locally.

The gap survived from the introduction of the `deps` type until 2026-09-05
because every `deps:` commit in the repo came from Dependabot through a
squash-merged PR, where the local commit-msg hook never runs. The first commit
of that type authored locally is the first to hit it — which is how it
surfaced, while committing the `fast-uri` and `qs` advisory fixes.

## Alternatives considered

- **Drop `deps` and use `chore(deps)`**, configuring release-please to surface
  that scope as its own changelog section. Removes the duplication at its
  source, but discards a deliberate, documented choice and trades a two-line
  config sync for release-please configuration that is harder to verify.
- **Delete the local commit-msg hook** and let CI's commitlint be the only
  gate. One list, no drift — but the feedback moves from the moment of
  committing to a CI round trip, and a rejected message then has to be fixed by
  rewriting a pushed commit.
- **Derive the hook's list from `commitlint.config.mjs`.** No drift by
  construction, but `conventional-pre-commit` is a Python hook and cannot
  import an ESM config; it would need a generator script or a wrapper, which is
  more machinery than a twelve-item list warrants.
- **Duplicate the list with a comment naming the sync target** — chosen.

## Reasoning

The duplication is small, static, and loud when it breaks. Commit types change
rarely, the list is twelve entries, and a divergence surfaces immediately as a
rejected commit naming the offending type — not as silent wrong behaviour.

The alternatives each trade that cheap, visible failure for something worse: a
lost changelog routing decision, a slower feedback loop that pushes failures
past the point where they are cheap to fix, or a code generator standing
between two config files.

Keeping both gates also preserves a real property: the local hook and CI check
the same rule, so a commit that passes locally passes in CI. That is the
property the missing `args` had quietly broken.

## Trade-offs accepted

Nothing enforces the sync. A type added to `commitlint.config.mjs` and not to
`.pre-commit-config.yaml` reproduces exactly the bug this fixes, and the
comment is the only thing pointing at the obligation.

The failure mode is bounded and self-announcing — the hook rejects the commit
and prints the type it refused — so it costs minutes, not a broken release. If
the lists do drift more than once, that is the signal to add a check asserting
they match rather than to keep re-syncing them by hand. Adding that check now
would be machinery for a problem that has occurred once.

## Supersedes: none

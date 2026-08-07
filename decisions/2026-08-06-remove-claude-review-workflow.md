## Decision: Remove the Claude review workflow

Delete `.github/workflows/claude-code-review.yaml`. PRs are reviewed by whatever
mechanism applies to the rest of the yo61 fleet, not by a per-repo workflow that
spends Anthropic model tokens on every push.

## Context

`unifi-mcp` was the only repo running this workflow. It was added on 2026-07-05
as Task 6 of the release-engineering plan, written to stay inert until two
manual steps were done: a `CLAUDE_CODE_OAUTH_TOKEN` secret and a
`CLAUDE_REVIEW_ENABLED=true` variable. Both were set the same day, 80 seconds
apart, and neither has been touched since.

Two facts, established while investigating why release PRs kept losing their
approvals, argue for removing it:

**The workflow predates the mechanism now credited with its output.** The
`yo61-lastlight` GitHub App (id 4367919) was created 2026-07-22, seventeen days
after this workflow shipped. Reviews arrive as `yo61-lastlight[bot]`, but the
job grants only `pull-requests: read`, so `GITHUB_TOKEN` cannot post a review at
all. The GitHub write capability comes from the org-wide lastlight installation
(`repository_selection: all`), not from this workflow. What the workflow
uniquely contributes is the _invocation_ and the Anthropic token that pays for
it.

**The variable is a cost knob, not a rollout gate.** Checked across all ten
review-gated/auto-merge repos: `CLAUDE_REVIEW_ENABLED` is set only here. lastlight
is already installed everywhere. `unifi-mcp` is not a repo that received a
rollout the others are missing; it is the one repo still carrying a pre-lastlight
mechanism.

## Alternatives considered

- **Keep it as-is.** Rejected: it makes this repo the fleet outlier and spends
  model tokens per push for a review nobody asked for on the other nine repos.
- **Roll it out to every repo.** Rejected: each repo would need its own Anthropic
  credential, multiplying both cost and stale-secret surface.
- **Remove the workflow, keep the secret and variable.** Rejected as the default:
  they become dead config, and the secret is an unrotated credential retained for
  a mechanism that no longer exists.

## Reasoning

The workflow's value was automated approval satisfying
`default_branch_ruleset_required_approving_review_count: 1`. That value is real
but narrow, and it is not how the other nine repos operate — there the same rule
is satisfied by the repo-admin bypass. Keeping one repo on a different model
made a fleet-wide question ("why did this release PR stall?") look like a
repo-specific bug, and cost several rounds of investigation to unpick.

`claude-review` was verified **not** to be a required status check before
removal. The `Required status checks` ruleset lists six contexts —
`check (node 22)`, `check (node 24)`, `Conventional Commits`, `zizmor`,
`osv-scanner`, `sbom-scan` — none of them this workflow. Deleting it therefore
cannot leave a required check permanently pending.

## Trade-offs accepted

- No automated approval on this repo. Rather than leave
  `required_approving_review_count: 1` satisfiable only by the repo-admin bypass —
  a rule overridden on every merge is worse than no rule — the companion change
  github-repos#47 dropped it to the module default of 0. Applied and verified:
  the `Default Branch` ruleset now reports `required_approving_review_count: 0`.
- The gate is now the `Required status checks` ruleset alone: six contexts,
  **no bypass actors**, binding admins too. Strictly less overridable than the
  review requirement it replaces.
- No human-approval requirement. An external fork PR can merge on green CI alone.
  Accepted because the previous approver was automated and its approval was
  overridable by the admin bypass anyway, and because CI includes `osv-scanner`
  and `sbom-scan` with no bypass.
- Auto-merge on release PRs is foreclosed, since it depended on lastlight
  supplying an approval. No practical loss: `allow_auto_merge: true` is set at
  repo level but has never been armed on a single PR.
- PRs lose an automated review pass. Accepted: CI, the security scanners, and
  prek remain, and they are what actually gate merges.

## Credentials removed

The `CLAUDE_CODE_OAUTH_TOKEN` secret and `CLAUDE_REVIEW_ENABLED` variable were
deleted from the repo's Actions settings on 2026-08-06 and verified gone. The
secret in particular was an unrotated credential dating to 2026-07-05. Done out
of band rather than in this PR: deleting a secret destroys its value and is not
revertible by reverting a merge.

Deleting the variable first was safe in either order. The job's `if:` requires
`vars.CLAUDE_REVIEW_ENABLED == 'true'`, so with the variable gone the workflow
skipped rather than failed while it still existed on `main` — a consequence of
the original design deliberately making it inert-unless-enabled.

## Supersedes

Partially supersedes 2026-07-05-release-engineering, which introduced this
workflow as Task 6 and listed enabling it as manual owner setup. The rest of that
decision — release-please, npm OIDC publishing, the security scanners, the
Taskfile — is unaffected.

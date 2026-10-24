# Dependencies — rules

Confirmed; apply by default.

1. **Hold a transitive advisory fix with a scoped override**, not the lockfile
   alone: `<pkg>@^<major>: ^<first-patched>` in `pnpm-workspace.yaml`. Raise an
   existing floor rather than adding a second entry.
   Confirmed 2026-09-29, 2026-10-09, 2026-10-21, 2026-10-23, 2026-10-24.
   (`decisions/2026-09-29-pin-advisory-floors.md`)
2. **Prove an advisory fix by falsification**: osv-scanner must report each
   advisory against the `main` lockfile and none on the branch. A clean scan of
   the branch alone does not show the scanner saw the package.
   Confirmed 2026-09-29, 2026-10-23, 2026-10-24.
3. **Fix rather than suppress** when a patched version is reachable, and treat
   any suppression as a claim about someone else's ranges that can go stale.
   Confirmed 2026-08-06, 2026-09-05, 2026-09-11.
   (`decisions/2026-08-06-fix-over-suppress-advisories.md`)

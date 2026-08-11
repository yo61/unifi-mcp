export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // `deps` is not a config-conventional type. Dependabot is configured
    // to use it so release-please can route those commits to a
    // Dependencies changelog section -- sections are keyed by type, and
    // the default `chore(deps)` lands under the hidden `chore` type.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "deps",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    // Allow class names / acronyms in subjects (e.g. "EntityIndex handles",
    // "MCP tools use"). The default ruleset rejects these cases.
    "subject-case": [0],
  },
};

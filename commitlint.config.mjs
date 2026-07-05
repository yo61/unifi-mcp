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

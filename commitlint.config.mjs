export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow class names / acronyms in subjects (e.g. "EntityIndex handles",
    // "MCP tools use"). The default ruleset rejects these cases.
    "subject-case": [0],
  },
};

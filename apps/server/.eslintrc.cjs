/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@solmarket/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  // Bun exposes the browser-style WebSocket / MessageEvent as globals; the
  // shared library config only declares `env: node`, which doesn't include
  // them. Declare them here so `service.round-anchor.ts` and any future
  // RTDS / WS client code doesn't trip no-undef.
  globals: {
    WebSocket: "readonly",
    MessageEvent: "readonly",
    CloseEvent: "readonly",
  },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["node_modules/", "dist/", ".eslintrc.cjs"],
};

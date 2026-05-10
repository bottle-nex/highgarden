/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@solmarket/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    "no-unused-vars": [
      "warn",
      { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" },
    ],
  },
  ignorePatterns: ["node_modules/", "dist/", ".eslintrc.cjs"],
};

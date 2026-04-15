/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@solmarket/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
};

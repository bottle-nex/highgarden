/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@solmarket/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ["node_modules/", "dist/", ".eslintrc.cjs"],
};

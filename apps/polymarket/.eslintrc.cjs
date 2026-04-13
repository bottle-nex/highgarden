/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@solmarket/eslint-config/library.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  rules: {
    "no-unused-vars": "off",
    "turbo/no-undeclared-env-vars": "off",
    indent: ["error", 4, { SwitchCase: 1 }],
  },
};

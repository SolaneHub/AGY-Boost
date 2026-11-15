import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-native/**",
      "src/cli/embedded/**",
      "pnpm-lock.yaml",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-empty-function": ["error", { allow: ["arrowFunctions", "methods"] }],
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts,d.ts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/client/**/*.{ts,js}"],
    rules: {
      // Enforce AGENTS.md invariant: no console.* in runtime mod/client code
      "no-console": "error",
    },
  },
  {
    files: ["tests/**/*.{ts,js,mjs}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    files: ["mods/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        context: "readonly",
        AGYBoost: "readonly",
        module: "readonly",
        exports: "writable",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  prettier
);

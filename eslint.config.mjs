import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default tseslint.config(
  // Global ignores (replaces .eslintignore)
  {
    ignores: ["node_modules/", "main.js", "dist/"],
  },

  // Obsidian plugin recommended config (already flat-config compatible)
  ...obsidianmd.configs.recommended,

  // Project-specific TypeScript configuration
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    rules: {
      // You can customize obsidianmd or ts-eslint rules here if needed
    },
  }
);

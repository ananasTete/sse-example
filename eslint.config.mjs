import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default defineConfig(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    ignores: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      ".output/**",
      "build/**",
      "out/**",
      "coverage/**",
      "prisma/dev.db*",
      "src/routeTree.gen.ts",
    ],
  },
);

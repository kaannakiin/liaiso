import { defineConfig } from "oxlint";
import { config } from "@sezzlee/oxlint-config/react";

export default defineConfig({
  extends: [config],
  ignorePatterns: [
    "dist/**",
    ".tanstack/**",
    "src/routeTree.gen.ts",
    "scripts/**",
  ],
});

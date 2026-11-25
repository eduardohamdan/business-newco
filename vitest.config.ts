import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts", "apps/worker/**/*.test.ts", "evals/**/*.test.ts"],
          exclude: ["packages/db/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "db",
          include: ["packages/db/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          fileParallelism: false,
        },
      },
    ],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/target/**",
      "tests/e2e/**",
    ],
  },
});

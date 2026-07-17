import { defineConfig } from "vitest/config";

// Standalone vitest config: vite.config.ts is scoped to the ui/ card bundle
// (root: "ui"), so tests need their own config rooted at the repo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

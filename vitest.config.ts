import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Exclude integration tests that need real database
    exclude: ["server/**/*.integration.test.ts", "node_modules/**"],
    // Global setup file to mock database by default
    setupFiles: ["./server/test-setup.ts"],
    // Ensure tests run in isolation
    isolate: true,
    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
  },
});

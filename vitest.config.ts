import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config — keeps the Next.js path alias `@/` working in test files
// without dragging in the full Next runtime. Tests should be node-only:
// pure logic from `lib/` is the primary target. UI components are not
// covered here (they need a browser environment + a heavier setup).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"],
    globals: false,
  },
});

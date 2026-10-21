import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure functions, next to the code they test (`*.test.ts`). The Playwright system
// tests in e2e/ (`*.spec.ts`) run separately, with `npm run test:system`.

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

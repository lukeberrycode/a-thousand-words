import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests (`npm test`), added for the GraphQL API (ADR 0015). They run in Node without a
// database: tests mock `@/lib/db`. The system tests in e2e/ are Playwright's, not Vitest's.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Bundle graphql-yoga and its graphql-tools and envelop dependencies, as Next.js does, so they
    // load the same copy of graphql as our code. Otherwise Node loads graphql's CommonJS build
    // for them and Vite its ES module build for us, and graphql refuses to mix the two.
    server: { deps: { inline: ["graphql-yoga", /@graphql-tools\//, /@graphql-yoga\//, /@envelop\//] } },
  },
});

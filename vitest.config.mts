import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests: pure functions, next to the code they test (`*.test.ts`), and the GraphQL API's,
// which mock `@/lib/db` so they run without a database. The Playwright system tests in e2e/
// (`*.spec.ts`) run separately, with `npm run test:system`.

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Bundle graphql-yoga and its graphql-tools and envelop dependencies, as Next.js does, so they
    // load the same copy of graphql as our code. Otherwise Node loads graphql's CommonJS build
    // for them and Vite its ES module build for us, and graphql refuses to mix the two.
    server: { deps: { inline: ["graphql-yoga", /@graphql-tools\//, /@graphql-yoga\//, /@envelop\//] } },
  },
});

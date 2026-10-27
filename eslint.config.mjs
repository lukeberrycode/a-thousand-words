import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The system tests' own dev server build, and the R2 mock's stored objects (ADR 0024).
    ".next-test/**",
    ".r2-mock/**",
    // The AWS CDK stack has its own package, config and checks (infra/README.md).
    "infra/**",
    // Git worktrees made by Claude Code are separate checkouts with their own checks.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;

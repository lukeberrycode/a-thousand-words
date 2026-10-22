// Loads .env.local, then .env, the order Next uses: a value in .env.local wins. In a worktree,
// .env.local holds the worktree's own DATABASE_URL (ADR 0020).

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

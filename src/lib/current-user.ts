import "server-only";
import { db } from "@/lib/db";

// Placeholder until Auth.js lands in milestone 3: every upload belongs to one demo user.
// Replace with the signed-in user (and reject anonymous requests) then.
const DEMO_EMAIL = "demo@a-thousand-words.local";

export async function getCurrentUser() {
  return db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Demo user" },
  });
}

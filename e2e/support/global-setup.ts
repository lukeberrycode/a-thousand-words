import { sql } from "./services";
import { TEST_USER_PREFIX, removeUsers } from "./world";

/** Remove anything left by an earlier run that stopped before cleaning up. */
export default async function globalSetup() {
  const leftovers = await sql<{ id: string }>(`SELECT id FROM "User" WHERE id LIKE $1`, [`${TEST_USER_PREFIX}%`]);
  await removeUsers(leftovers.map((u) => u.id));
}

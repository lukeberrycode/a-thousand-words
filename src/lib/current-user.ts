import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

/** The signed-in user, or null. Server actions must check this: they're reachable by direct POST. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name ?? null, image: user.image ?? null };
});

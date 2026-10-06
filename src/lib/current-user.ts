import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

/**
 * The signed-in user, or null. Server actions must check this: they're reachable by direct POST.
 * New accounts start pending: only `approved` users may upload or annotate.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, name: user.name ?? null, image: user.image ?? null, approved: session?.approved === true };
});

/** Error for a signed-in user whose account hasn't been approved yet. */
export const PENDING_APPROVAL = "Your account is waiting for approval. You can upload and annotate once it's approved.";

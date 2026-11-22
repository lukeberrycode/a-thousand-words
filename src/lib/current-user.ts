// Make the build fail if this file is imported from client code.
import "server-only";

// Import React's `cache`, which memoises a function for the length of one request.
import { cache } from "react";

// Import the Auth.js function that reads the current session.
import { auth } from "@/auth";

/**
 * The signed-in user, or null. Server actions must check this: they're reachable by direct POST.
 * New accounts start pending: only `approved` users may upload or annotate.
 */
export const getCurrentUser = cache(async () => {
  // Look up the session for this request.
  const session = await auth();

  // Take the user out of the session, if there is one.
  const user = session?.user;

  // With no signed-in user (or no id), return null.
  if (!user?.id) return null;

  // Return only the fields callers need, with missing values as null and `approved` as a strict boolean.
  return { id: user.id, name: user.name ?? null, image: user.image ?? null, approved: session?.approved === true };
});

/** Error for a signed-in user whose account hasn't been approved yet. */
export const PENDING_APPROVAL = "Your account is waiting for approval. You can upload and annotate once it's approved.";

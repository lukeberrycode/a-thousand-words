// Import the Auth.js request handlers from the auth setup.
import { handlers } from "@/auth";

// Re-export the GET and POST handlers so Next.js serves them at /api/auth/*.
export const { GET, POST } = handlers;

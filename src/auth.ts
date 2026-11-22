// Import the Auth.js core.
import NextAuth from "next-auth";

// Import the GitHub sign-in provider.
import GitHub from "next-auth/providers/github";

// Import the adapter that stores Auth.js data through Prisma.
import { PrismaAdapter } from "@auth/prisma-adapter";

// Import the shared database client.
import { db } from "@/lib/db";

// Add our own fields to Auth.js's Session type.
declare module "next-auth" {
  // Extend the Session interface.
  interface Session {
    /** Whether the site owner has approved this account to upload and annotate. */
    approved?: boolean;
  }
}

// Auth.js v5 with GitHub sign-in and database sessions. See docs/adr/0007.
// GitHub reads AUTH_GITHUB_ID and AUTH_GITHUB_SECRET; Auth.js reads AUTH_SECRET.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Store users, accounts and sessions in the database.
  adapter: PrismaAdapter(db),

  // Allow sign-in with GitHub only.
  providers: [GitHub],

  // Hooks that change what Auth.js does.
  callbacks: {
    // The default session only carries name, email and image; we need the id to own content,
    // and whether the account is approved. `user` is the full User row from the database.
    session({ session, user }) {
      // Copy the database id onto the session's user.
      session.user.id = user.id;

      // Mark the session approved when the user row has an approval date.
      session.approved = (user as { approvedAt?: Date | null }).approvedAt != null;

      // Return the changed session.
      return session;
    },
  },
});

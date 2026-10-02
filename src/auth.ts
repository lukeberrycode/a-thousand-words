import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

// Auth.js v5 with GitHub sign-in and database sessions. See docs/adr/0007.
// GitHub reads AUTH_GITHUB_ID and AUTH_GITHUB_SECRET; Auth.js reads AUTH_SECRET.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [GitHub],
  callbacks: {
    // The default session only carries name, email and image; we need the id to own content.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});

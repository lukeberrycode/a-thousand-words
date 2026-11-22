// Import Next.js's client-side navigation link.
import Link from "next/link";

// Import the Auth.js sign-in and sign-out functions.
import { signIn, signOut } from "@/auth";

// Import the current-user lookup.
import { getCurrentUser } from "@/lib/current-user";

/** Header controls: upload (once approved) and sign out when signed in, otherwise a sign-in button. */
export async function UserMenu() {
  // Find out who is signed in, if anyone.
  const user = await getCurrentUser();

  // Visitors who aren't signed in get the sign-in button.
  if (!user) return <SignInButton />;

  // Signed-in users get the menu.
  return (
    // A row of controls with even spacing.
    <div className="flex items-center gap-4 text-sm">
      {/* Approved users can upload. */}
      {user.approved ? (
        // A link to the upload page.
        <Link href="/upload" className="hover:underline">
          {/* The link text. */}
          Upload
        </Link>
      ) : (
        // Everyone else sees that they're waiting.
        <span className="text-zinc-500">Awaiting approval</span>
      )}
      {/* Show the avatar only if the user has one. */}
      {user.image && (
        // eslint-disable-next-line @next/next/no-img-element -- small external avatar
        <img src={user.image} alt="" width={24} height={24} className="size-6 rounded-full" />
      )}
      {/* The user's name, hidden on very small screens. */}
      <span className="hidden sm:inline">{user.name}</span>
      {/* The sign-out form. */}
      <form
        // Run this function on the server when the form is submitted.
        action={async () => {
          // Mark the function as a server action.
          "use server";

          // Sign out, then go to the home page.
          await signOut({ redirectTo: "/" });
        }}
      >
        {/* The button that submits the form. */}
        <button type="submit" className="hover:underline">
          {/* The button text. */}
          Sign out
        </button>
      </form>
    </div>
  );
}

/** Signs in with GitHub, then returns to `redirectTo` (the home page by default). */
export function SignInButton({ redirectTo = "/", label = "Sign in with GitHub" }) {
  // Return the sign-in form.
  return (
    // The form that starts GitHub sign-in.
    <form
      // Run this function on the server when the form is submitted.
      action={async () => {
        // Mark the function as a server action.
        "use server";

        // Start GitHub sign-in, then come back to `redirectTo`.
        await signIn("github", { redirectTo });
      }}
    >
      {/* The button that submits the form. */}
      <button type="submit" className="text-sm hover:underline">
        {/* The button text. */}
        {label}
      </button>
    </form>
  );
}

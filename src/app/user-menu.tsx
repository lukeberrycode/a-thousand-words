import Link from "next/link";
import { signIn, signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";

/** Header controls: upload and sign out when signed in, otherwise a sign-in button. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return <SignInButton />;

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/upload" className="hover:underline">
        Upload
      </Link>
      {user.image && (
        // eslint-disable-next-line @next/next/no-img-element -- small external avatar
        <img src={user.image} alt="" width={24} height={24} className="size-6 rounded-full" />
      )}
      <span className="hidden sm:inline">{user.name}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}

/** Signs in with GitHub, then returns to `redirectTo` (the home page by default). */
export function SignInButton({ redirectTo = "/", label = "Sign in with GitHub" }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github", { redirectTo });
      }}
    >
      <button type="submit" className="text-sm hover:underline">
        {label}
      </button>
    </form>
  );
}

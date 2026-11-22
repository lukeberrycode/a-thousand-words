// Import Next.js's client-side navigation link.
import Link from "next/link";

// Import Suspense, which shows a fallback while part of the page loads.
import { Suspense } from "react";

// Import the menu that shows who is signed in.
import { UserMenu } from "../user-menu";

/**
 * The site header, for every page except the image page, which uses the whole screen and has the
 * same links in its UI panel (docs/enrich-UI.md).
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  // Return the layout markup.
  return (
    // Use a fragment so no extra wrapper element is added.
    <>
      {/* The header, with a line along its bottom edge. */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        {/* The navigation bar: site name on the left, user menu on the right. */}
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          {/* The site name, linking to the home page. */}
          <Link href="/" className="font-semibold">
            {/* The site name text. */}A Thousand Words
          </Link>
          {/* The session lookup hits the database; don't hold the rest of the page for it. */}
          <Suspense fallback={<div aria-hidden className="h-6 w-24" />}>
            {/* The sign-in or user menu. */}
            <UserMenu />
          </Suspense>
        </nav>
      </header>
      {/* The page being wrapped. */}
      {children}
    </>
  );
}

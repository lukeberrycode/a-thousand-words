import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "../user-menu";

/**
 * The site header, for every page except the image page, which uses the whole screen and has the
 * same links in its UI panel (docs/enrich-UI.md).
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold">
            A Thousand Words
          </Link>
          {/* The session lookup hits the database; don't hold the rest of the page for it. */}
          <Suspense fallback={<div aria-hidden className="h-6 w-24" />}>
            <UserMenu />
          </Suspense>
        </nav>
      </header>
      {children}
    </>
  );
}

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UserMenu } from "./user-menu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "A Thousand Words",
  description: "Annotate the details of any image: draw a region and explain what's there.",
};

// On Android, let the on-screen keyboard shrink the layout viewport, so fixed content such as
// the annotation editor sheet sits above it. iOS ignores this; see src/lib/use-keyboard-inset.ts.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
      </body>
    </html>
  );
}

import type { Metadata } from "next";
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
  description: "Annotate the details of any image, Genius-style.",
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

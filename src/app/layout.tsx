// Import the types for page metadata and viewport settings.
import type { Metadata, Viewport } from "next";

// Import the two Google fonts, loaded by Next.js.
import { Geist, Geist_Mono } from "next/font/google";

// Import the global styles.
import "./globals.css";

// Load the Geist sans font.
const geistSans = Geist({
  // Expose it as this CSS variable.
  variable: "--font-geist-sans",

  // Load only the Latin characters.
  subsets: ["latin"],
});

// Load the Geist Mono font.
const geistMono = Geist_Mono({
  // Expose it as this CSS variable.
  variable: "--font-geist-mono",

  // Load only the Latin characters.
  subsets: ["latin"],
});

// The default title and description for every page.
export const metadata: Metadata = {
  // The browser tab title.
  title: "A Thousand Words",

  // The description search engines show.
  description: "Annotate the details of any image: draw a region and explain what's there.",
};

// On Android, let the on-screen keyboard shrink the layout viewport, so fixed content such as
// the annotation card sits above it. iOS ignores this; see src/lib/use-screen-layout.ts.
export const viewport: Viewport = {
  // Match the device's screen width.
  width: "device-width",

  // Start at normal zoom.
  initialScale: 1,

  // Let the on-screen keyboard resize the layout viewport.
  interactiveWidget: "resizes-content",
};

// The root layout that wraps every page.
export default function RootLayout({ children }: LayoutProps<"/">) {
  // Return the page shell.
  return (
    // The HTML element: English, with the font variables, full height and smooth text.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* The body: at least full height, laid out as a column. */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

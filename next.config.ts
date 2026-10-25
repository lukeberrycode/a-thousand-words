import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The system tests run their own `next dev` beside any dev server already running in this
  // checkout. Next allows one dev server per build folder, so they use another (ADR 0024).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

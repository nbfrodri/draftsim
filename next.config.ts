import type { NextConfig } from "next";
import path from "node:path";

// Note: the app uses plain <img> tags (CommunityDragon + Meraki), so no
// next/image remotePatterns are needed here.
const nextConfig: NextConfig = {
  // Static export for Tauri packaging: `next build` emits a fully static
  // site into out/, which src-tauri/tauri.conf.json points at via
  // frontendDist. Champions are fetched at build time (app/page.tsx).
  output: "export",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

// Note: the app uses plain <img> tags (CommunityDragon + Meraki), so no
// next/image remotePatterns are needed here.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;

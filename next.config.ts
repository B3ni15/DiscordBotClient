import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export: the app is a pure browser client, there is no server.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["dishy.pro", "www.dishy.pro"],
  experimental: {
    // The built-in Next MCP writes .next/dev/logs/next-development.log.
    // Project tooling keeps runtime logs in the root logs/ directory instead.
    mcpServer: false,
  },
  turbopack: {
    // Public docs and the backend AI embed import the same catalog from the
    // repository. Allow Turbopack to resolve that one shared file without a
    // generated frontend copy that could drift.
    root: path.resolve(__dirname, ".."),
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8080",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8080",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

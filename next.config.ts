import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      // Patient documents are capped at 1 MB after client-side compression.
      // Leave room for multipart field headers and boundaries.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

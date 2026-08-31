import type { NextConfig } from "next";

// Next.js rejects a deploymentId longer than 32 characters, but
// VERCEL_GIT_COMMIT_SHA is a full 40-character git SHA. Truncate rather than
// drop it: a 32-character prefix is still unique per deployment, which is all
// skew protection needs.
const rawDeploymentId =
  process.env.DEPLOYMENT_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA;
const deploymentId = rawDeploymentId?.slice(0, 32);
const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Vercel injects its own Next.js adapter and output pipeline. Standalone
  // output is only needed by the self-hosted Docker image.
  ...(!isVercelBuild ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "192.168.1.8"],
  ...(deploymentId ? { deploymentId } : {}),
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      // Patient documents are capped at 1 MB after client-side compression.
      // Leave room for multipart field headers and boundaries.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

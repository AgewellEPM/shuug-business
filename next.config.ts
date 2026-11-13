import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/setup/wordpress": ["./integrations/wordpress/shuug-business/**/*"] },
  // For constrained build hosts; installed runtime behavior is unchanged.
  webpack(config, { dev }) {
    if (!dev && process.env.SHUUG_BUILD_NO_CACHE === "true") config.cache = false;
    return config;
  },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Public marketing site (static, bypasses the authed app shell) — clean multi-page URLs.
  async rewrites() {
    return [
      { source: "/welcome", destination: "/site/index.html" },
      { source: "/welcome/:slug", destination: "/site/:slug.html" },
      { source: "/tour", destination: "/site/index.html" },
      { source: "/docs", destination: "/docs/index.html" },
      { source: "/docs/:slug", destination: "/docs/:slug.html" },
    ];
  },
};

export default nextConfig;

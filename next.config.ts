import type { NextConfig } from "next";

import { createSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: createSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;

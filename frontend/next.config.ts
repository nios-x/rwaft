import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3000"
    return [
      { source: "/deploy", destination: `${backendUrl}/deploy` },
      { source: "/prompt", destination: `${backendUrl}/prompt` },
    ]
  },
};

export default nextConfig;

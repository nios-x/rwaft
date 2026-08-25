import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = (
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://rwaft.onrender.com"
    ).replace(/\/+$/, "")
    return [
      { source: "/deploy", destination: `${backendUrl}/deploy` },
      { source: "/prompt", destination: `${backendUrl}/prompt` },
    ]
  },
};

export default nextConfig;

import type { NextConfig } from "next";

/**
 * The browser talks to the API directly using NEXT_PUBLIC_BACKEND_URL.
 *
 * The previous config proxied /deploy and /prompt through Next rewrites, but
 * the page never used them — it called the backend origin directly — so the
 * rewrites were dead code pointing at a hardcoded production host. Direct calls
 * are also what the live log stream needs: Server-Sent Events through a rewrite
 * risks being buffered by the edge proxy, which would stall the stream.
 *
 * Cross-origin access is controlled by the API's FRONTEND_ORIGIN allowlist.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;

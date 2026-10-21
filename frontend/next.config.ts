import type { NextConfig } from "next";
import { SITE_URL } from "./lib/site";

const canonicalHost = new URL(SITE_URL).host;

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
  // The Docker image (frontend/Dockerfile) sets this to ship only the traced
  // server files. Vercel builds leave it unset and use their own output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  // www and the bare domain would otherwise be indexed as two sites competing
  // for the same queries. A no-op until www is pointed at this deployment.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${canonicalHost}` }],
        destination: `${SITE_URL}/:path*`,
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Google sign-in needs the origin in the referrer; `no-referrer`
          // would break the button.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Browsers honour this only over HTTPS, so local http is unaffected.
          // No includeSubDomains: deployed sites live on *.rwaft.live and must
          // not be pinned to HTTPS by the console before their certificate is.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          // Deliberately absent:
          // - Cross-Origin-Opener-Policy: `same-origin` severs the Google
          //   sign-in popup from this page and sign-in silently fails.
          // - Permissions-Policy: it also binds the preview iframe, so a
          //   generated app that uses the camera or location would break there.
        ],
      },
    ];
  },
};

export default nextConfig;

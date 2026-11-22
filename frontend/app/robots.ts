import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/ holds only the health check, which has nothing worth indexing.
    // /admin and /dashboard are noindex too, and only show anything to a
    // signed-in visitor; disallowing them keeps crawl budget on real pages.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/ holds only the health check, which has nothing worth indexing.
    // /admin is noindex too; disallowing it keeps crawl budget on real pages.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

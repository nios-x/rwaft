import type { MetadataRoute } from "next";
import { LEGAL_UPDATED, SITE_URL } from "../lib/site";

/**
 * Every indexable page. Builds open in place rather than at their own route,
 * and deployed sites live on the API's hosts, so neither belongs here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["/how-it-works", "/pricing", "/faq"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(LEGAL_UPDATED),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

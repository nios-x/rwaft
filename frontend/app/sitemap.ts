import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/**
 * The console is one page. Builds open in place rather than at their own
 * route, and deployed sites live on the API's hosts, so neither belongs here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}

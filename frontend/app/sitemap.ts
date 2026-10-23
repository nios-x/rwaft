import type { MetadataRoute } from "next";
import { COMPARED_ON, RIVALS } from "../lib/compare";
import { CONTENT_UPDATED, LEGAL_UPDATED, SITE_URL } from "../lib/site";
import { USE_CASES } from "../lib/useCases";

/**
 * Every indexable page. Builds open in place rather than at their own route,
 * and deployed sites live on the API's hosts, so neither belongs here.
 *
 * lastModified is when the page's words last changed, not when the sitemap
 * was served: search engines stop trusting a lastmod that is always "now".
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, updated: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(updated),
    priority,
  });

  return [
    page("", CONTENT_UPDATED, 1),
    ...["/how-it-works", "/pricing", "/faq"].map((path) => page(path, CONTENT_UPDATED, 0.8)),
    page("/make", CONTENT_UPDATED, 0.8),
    ...USE_CASES.map((item) => page(`/make/${item.slug}`, CONTENT_UPDATED, 0.7)),
    page("/compare", COMPARED_ON, 0.8),
    ...RIVALS.map((item) => page(`/compare/${item.slug}`, COMPARED_ON, 0.7)),
    ...["/about", "/trailer"].map((path) => page(path, CONTENT_UPDATED, 0.5)),
    page("/privacy", LEGAL_UPDATED, 0.2),
    page("/terms", LEGAL_UPDATED, 0.2),
  ];
}

import type { MetadataRoute } from "next";
import { COMPARED_ON, COMPARE_SLUGS, ROUNDUP_PATH } from "../lib/compare";
import { docsFor } from "../lib/docs";
import { GUIDES } from "../lib/guides";
import { getPricing } from "../lib/pricing";
import { CONTENT_UPDATED, LEGAL_UPDATED, SITE_URL } from "../lib/site";
import { USE_CASES } from "../lib/useCases";

/** Lists the docs the live configuration has on, like the docs pages themselves. */
export const revalidate = 3600;

/**
 * Every indexable page. Builds open in place rather than at their own route,
 * and deployed sites live on the API's hosts, so neither belongs here.
 *
 * lastModified is when the page's words last changed, not when the sitemap
 * was served: search engines stop trusting a lastmod that is always "now".
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const page = (path: string, updated: string, priority: number) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(updated),
    priority,
  });
  const docs = docsFor(await getPricing());

  return [
    page("", CONTENT_UPDATED, 1),
    ...["/how-it-works", "/pricing", "/faq"].map((path) => page(path, CONTENT_UPDATED, 0.8)),
    page("/make", CONTENT_UPDATED, 0.8),
    ...USE_CASES.map((item) => page(`/make/${item.slug}`, CONTENT_UPDATED, 0.7)),
    page("/compare", COMPARED_ON, 0.8),
    page(ROUNDUP_PATH, COMPARED_ON, 0.8),
    ...COMPARE_SLUGS.map((slug) => page(`/compare/${slug}`, COMPARED_ON, 0.7)),
    page("/docs", CONTENT_UPDATED, 0.7),
    ...docs.map((item) => page(`/docs/${item.slug}`, CONTENT_UPDATED, 0.6)),
    page("/guides", CONTENT_UPDATED, 0.7),
    ...GUIDES.map((item) => page(`/guides/${item.slug}`, item.updated, 0.6)),
    ...["/about", "/trailer"].map((path) => page(path, CONTENT_UPDATED, 0.5)),
    page("/privacy", LEGAL_UPDATED, 0.2),
    page("/terms", LEGAL_UPDATED, 0.2),
  ];
}

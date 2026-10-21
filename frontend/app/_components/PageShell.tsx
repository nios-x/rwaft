import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { SITE_NAME, SITE_URL } from "../../lib/site"
import { Mark } from "./Icons"
import { SiteFooter } from "./SiteFooter"
import { SiteNav, type InfoPath } from "./SiteNav"

/**
 * Metadata for a standalone page. Next merges metadata shallowly, so a page
 * that sets only its canonical would still inherit the home page's og:url and
 * title; this sets the whole Open Graph block for the page itself. The image
 * comes from the `opengraph-image.tsx` beside each page, which this block
 * would otherwise hide.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
	return {
		title,
		description,
		alternates: { canonical: path },
		openGraph: { type: "article", url: path, siteName: SITE_NAME, title, description, locale: "en_US" },
		twitter: { card: "summary_large_image", title, description },
	}
}

/**
 * Header, content and footer for every page outside the console. `crumb`
 * names the page for its BreadcrumbList, which is what lets a search result
 * read "rwaft.live › Pricing" instead of a bare URL.
 */
export function PageShell({ current, crumb, children }: { current?: InfoPath; crumb?: { name: string; path: string }; children: ReactNode }) {
	return (
		<div className="app" data-screen="page">
			{crumb && (
				<JsonLd
					data={{
						"@context": "https://schema.org",
						"@type": "BreadcrumbList",
						itemListElement: [
							{ "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
							{ "@type": "ListItem", position: 2, name: crumb.name, item: `${SITE_URL}${crumb.path}` },
						],
					}}
				/>
			)}
			<header className="header">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
				<SiteNav current={current} />
				<div className="header-right">
					<Link href="/" className="pill-btn pill-btn--ink">Start building</Link>
				</div>
			</header>
			{children}
			<SiteFooter />
		</div>
	)
}

/** Structured data for one page. `<` is escaped so no string in it can close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
	return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
}

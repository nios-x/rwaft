import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { LEGAL_UPDATED, SITE_NAME } from "../../lib/site"
import { Mark } from "./Icons"
import { SiteFooter } from "./SiteFooter"

/**
 * Metadata for a standalone page. Next merges metadata shallowly, so a page
 * that sets only its canonical would still inherit the home page's og:url and
 * title; this sets the whole Open Graph block for the page itself.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
	return {
		title,
		description,
		alternates: { canonical: path },
		openGraph: { type: "article", url: path, siteName: SITE_NAME, title, description, locale: "en_US" },
		twitter: { card: "summary", title, description },
	}
}

const updated = new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
})

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="app" data-screen="page">
			<header className="header">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
				<div className="header-right">
					<Link href="/" className="pill-btn pill-btn--ink">Start building</Link>
				</div>
			</header>
			<main className="legal">
				<article>
					<h1>{title}</h1>
					<p className="legal-updated">Last updated <time dateTime={LEGAL_UPDATED}>{updated}</time></p>
					{children}
				</article>
			</main>
			<SiteFooter />
		</div>
	)
}

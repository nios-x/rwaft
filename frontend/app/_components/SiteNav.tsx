import Link from "next/link"

/**
 * The header's links, in reading order. These are the pages Google is most
 * likely to show as sitelinks under a search for "rwaft", so every page
 * links to the same short list with the same words. About and the trailer
 * live in the footer.
 */
export const INFO_PAGES = [
	{ href: "/how-it-works", label: "How it works" },
	{ href: "/make", label: "Use cases" },
	{ href: "/compare", label: "Compare" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/docs", label: "Docs" },
	{ href: "/faq", label: "FAQ" },
] as const

/** Any page's own path; only the ones in the header are marked as current. */
export type InfoPath = `/${string}`

/** Plain links, so it renders the same in the console's client header and the server pages. */
export function SiteNav({ current, className = "" }: { current?: InfoPath; className?: string }) {
	return (
		<nav className={`site-nav ${className}`.trim()} aria-label="About rwaft">
			{INFO_PAGES.map((page) => (
				<Link key={page.href} href={page.href} aria-current={page.href === current ? "page" : undefined}>
					{page.label}
				</Link>
			))}
		</nav>
	)
}

import Link from "next/link"

/** The pages that explain rwaft, in reading order. */
export const INFO_PAGES = [
	{ href: "/trailer", label: "Trailer" },
	{ href: "/how-it-works", label: "How it works" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/faq", label: "FAQ" },
	{ href: "/about", label: "About" },
] as const

export type InfoPath = (typeof INFO_PAGES)[number]["href"]

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

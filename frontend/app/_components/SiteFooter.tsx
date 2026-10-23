import Link from "next/link"
import { RIVALS } from "../../lib/compare"
import { CONTACT_LABEL, CONTACT_URL } from "../../lib/site"
import { USE_CASES } from "../../lib/useCases"
import { XIcon } from "./Icons"
import { INFO_PAGES } from "./SiteNav"

/**
 * Every page rwaft serves, from every page, including the home screen. It's
 * how a crawler that lands anywhere reaches the rest, and the only link to
 * the privacy policy and terms.
 */
const COLUMNS = [
	{ title: "rwaft", links: [{ href: "/", label: "Start building" }, ...INFO_PAGES] },
	{
		title: "Build",
		links: [...USE_CASES.slice(0, 7).map((item) => ({ href: `/make/${item.slug}`, label: item.name })), { href: "/make", label: "Everything you can build" }],
	},
	{
		title: "Compare",
		links: [...RIVALS.map((item) => ({ href: `/compare/${item.slug}`, label: `rwaft vs ${item.name}` })), { href: "/compare", label: "All side by side" }],
	},
	{
		title: "Legal",
		links: [
			{ href: "/privacy", label: "Privacy policy" },
			{ href: "/terms", label: "Terms of service" },
		],
	},
]

/** Shared by the home screen and the standalone pages: the site's links, then copyright and the maker's X account. */
export function SiteFooter() {
	return (
		<footer className="site-footer">
			<nav className="site-footer-cols" aria-label="Site">
				{COLUMNS.map((column) => (
					<div key={column.title} className="site-footer-col">
						<p className="site-footer-head">{column.title}</p>
						<ul>
							{column.links.map((link) => (
								<li key={link.href}><Link href={link.href}>{link.label}</Link></li>
							))}
						</ul>
					</div>
				))}
			</nav>
			<div className="site-footer-base">
				<p className="site-footer-copy">© {new Date().getFullYear()} rwaft</p>
				<a href={CONTACT_URL} className="site-footer-contact" target="_blank" rel="noreferrer" aria-label={`${CONTACT_LABEL} on X`}>
					<XIcon className="site-footer-contact-icon" />
					<span>{CONTACT_LABEL}</span>
				</a>
			</div>
		</footer>
	)
}

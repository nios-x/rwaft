import Link from "next/link"
import { ROUNDUP_PATH, rival } from "../../lib/compare"
import { GUIDES } from "../../lib/guides"
import { CONTACT_LABEL, CONTACT_URL } from "../../lib/site"
import { findUseCase } from "../../lib/useCases"
import { XIcon } from "./Icons"

/**
 * Shared by the home screen and the standalone pages. The columns are how
 * crawlers reach every explanatory page from every other one, and how a
 * phone, whose header hides the nav on the home screen, reaches them at all.
 */

const useCase = (slug: string) => ({ href: `/make/${slug}`, label: findUseCase(slug)!.name })
const versus = (slug: string) => ({ href: `/compare/${slug}`, label: `rwaft vs ${rival(slug)!.name}` })

const COLUMNS = [
	{
		title: "Product",
		links: [
			{ href: "/how-it-works", label: "How it works" },
			{ href: "/pricing", label: "Pricing" },
			{ href: "/docs", label: "Docs" },
			{ href: "/faq", label: "FAQ" },
			{ href: "/about", label: "About" },
			{ href: "/trailer", label: "Trailer" },
		],
	},
	{
		title: "Build",
		links: [
			...["landing-page", "portfolio-website", "small-business-website", "restaurant-website", "wedding-website", "resume-website", "web-app", "browser-game"].map(useCase),
			{ href: "/make", label: "All use cases" },
		],
	},
	{
		title: "Compare",
		links: [
			...["lovable-alternative", "bolt-alternative", "v0-alternative", "replit-alternative"].map(versus),
			{ href: "/compare/lovable-vs-bolt", label: "Lovable vs Bolt" },
			{ href: ROUNDUP_PATH, label: "Best AI app builders" },
			{ href: "/compare", label: "All comparisons" },
		],
	},
	{
		title: "Guides",
		links: [...GUIDES.map((item) => ({ href: `/guides/${item.slug}`, label: item.name })), { href: "/guides", label: "All guides" }],
	},
]

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<nav className="site-footer-cols" aria-label="Site">
				{COLUMNS.map((column) => (
					<div key={column.title} className="site-footer-col">
						<h2>{column.title}</h2>
						<ul>
							{column.links.map((link) => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
						</ul>
					</div>
				))}
			</nav>
			<div className="site-footer-base">
				<p className="site-footer-copy">© {new Date().getFullYear()} rwaft</p>
				<Link href="/privacy" className="site-footer-legal">Privacy</Link>
				<Link href="/terms" className="site-footer-legal">Terms</Link>
				<a href={CONTACT_URL} className="site-footer-contact" target="_blank" rel="noreferrer" aria-label={`${CONTACT_LABEL} on X`}>
					<XIcon className="site-footer-contact-icon" />
					<span>{CONTACT_LABEL}</span>
				</a>
			</div>
		</footer>
	)
}

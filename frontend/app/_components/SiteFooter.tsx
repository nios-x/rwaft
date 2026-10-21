import Link from "next/link"
import { CONTACT_EMAIL, CONTACT_URL } from "../../lib/site"
import { MailIcon, Mark } from "./Icons"

/**
 * Shared by the home screen and the legal pages. Plain links, so crawlers can
 * reach every indexable page from every other one.
 */
export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer-inner">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
				<nav aria-label="Footer">
					<ul className="site-footer-links">
						<li><Link href="/how-it-works">How it works</Link></li>
						<li><Link href="/pricing">Pricing</Link></li>
						<li><Link href="/faq">FAQ</Link></li>
						<li><Link href="/privacy">Privacy</Link></li>
						<li><Link href="/terms">Terms</Link></li>
					</ul>
				</nav>
				<div className="site-footer-end">
					<p className="site-footer-copy">© {new Date().getFullYear()} rwaft</p>
					<a href={CONTACT_URL} className="site-footer-contact">
						<MailIcon className="site-footer-contact-icon" />
						<span>{CONTACT_EMAIL}</span>
					</a>
				</div>
			</div>
		</footer>
	)
}

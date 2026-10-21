import Link from "next/link"
import { AUTHOR_HANDLE, AUTHOR_URL, SOURCE_URL } from "../../lib/site"
import { GitHubIcon, Mark } from "./Icons"

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
						<li><a href={SOURCE_URL} rel="noopener">GitHub</a></li>
					</ul>
				</nav>
				<div className="site-footer-end">
					<p className="site-footer-copy">© {new Date().getFullYear()} rwaft</p>
					<a href={AUTHOR_URL} className="site-footer-author" rel="noopener" target="_blank">
						<GitHubIcon className="site-footer-author-icon" />
						<span>Built by <strong>{AUTHOR_HANDLE}</strong></span>
					</a>
				</div>
			</div>
		</footer>
	)
}

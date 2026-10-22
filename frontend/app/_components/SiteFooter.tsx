import { CONTACT_LABEL, CONTACT_URL } from "../../lib/site"
import { XIcon } from "./Icons"

/** Shared by the home screen and the standalone pages: copyright and the maker's X account, bottom right. */
export function SiteFooter() {
	return (
		<footer className="site-footer">
			<p className="site-footer-copy">© {new Date().getFullYear()} rwaft</p>
			<a href={CONTACT_URL} className="site-footer-contact" target="_blank" rel="noreferrer" aria-label={`${CONTACT_LABEL} on X`}>
				<XIcon className="site-footer-contact-icon" />
				<span>{CONTACT_LABEL}</span>
			</a>
		</footer>
	)
}

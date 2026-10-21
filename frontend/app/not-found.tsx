import Link from "next/link"
import { Mark } from "./_components/Icons"
import { SiteFooter } from "./_components/SiteFooter"

/**
 * Any URL the console doesn't serve. Deployed sites live on the API's hosts,
 * so a build link pasted onto this domain lands here; say where to look.
 * Next marks this response noindex on its own.
 */
export default function NotFound() {
	return (
		<div className="app" data-screen="page">
			<header className="header">
				<Link href="/" className="brand" aria-label="rwaft home">
					<Mark className="brand-mark" />
					<span>rwaft</span>
				</Link>
			</header>
			<main className="legal legal--center">
				<p className="legal-code" aria-hidden="true">404</p>
				<h1>This page doesn&apos;t exist</h1>
				<p>
					The link may be mistyped, or it may point at a site that was built with rwaft. Those live at their own
					address, which you&apos;ll find in the build&apos;s preview.
				</p>
				<Link href="/" className="pill-btn pill-btn--ink">Back to rwaft</Link>
			</main>
			<SiteFooter />
		</div>
	)
}

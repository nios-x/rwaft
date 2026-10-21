import type { ReactNode } from "react"
import { LEGAL_UPDATED } from "../../lib/site"
import { PageShell } from "./PageShell"

export { pageMetadata } from "./PageShell"

const updated = new Date(`${LEGAL_UPDATED}T00:00:00Z`).toLocaleDateString("en-US", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
})

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
	return (
		<PageShell>
			<main className="legal">
				<article>
					<h1>{title}</h1>
					<p className="legal-updated">Last updated <time dateTime={LEGAL_UPDATED}>{updated}</time></p>
					{children}
				</article>
			</main>
		</PageShell>
	)
}

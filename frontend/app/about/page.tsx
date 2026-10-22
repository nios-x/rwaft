import { About } from "../_components/InfoSections"
import { PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/about",
	"About: an AI website builder that shows its work",
	"rwaft turns a plain-language description into a live website and shows you the real build as it happens. Why it works that way, and what it runs on."
)

export default function AboutPage() {
	return (
		<PageShell current="/about" crumb={{ name: "About", path: "/about" }}>
			<main className="info">
				<About />
			</main>
		</PageShell>
	)
}

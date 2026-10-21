import { HowItWorks } from "../_components/InfoSections"
import { PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/how-it-works",
	"How the AI app builder works: prompt to live site",
	"Describe an app in plain words and rwaft's AI plans, writes and builds a React app step by step, then hosts it at its own live link."
)

export default function HowItWorksPage() {
	return (
		<PageShell current="/how-it-works" crumb={{ name: "How it works", path: "/how-it-works" }}>
			<main className="info">
				<HowItWorks />
			</main>
		</PageShell>
	)
}

import { HowItWorks } from "../_components/InfoSections"
import { PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/how-it-works",
	"How the AI app builder works",
	"Describe an app in plain words, watch rwaft's AI plan, write and build it step by step, then share it at its own live link."
)

export default function HowItWorksPage() {
	return (
		<PageShell current="/how-it-works">
			<main className="info">
				<HowItWorks />
			</main>
		</PageShell>
	)
}

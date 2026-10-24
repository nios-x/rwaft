import { getPricing } from "../../lib/pricing"
import { CompareHub } from "../_components/Compare"
import { PageShell, pageMetadata } from "../_components/PageShell"

/** rwaft's column quotes live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

export const metadata = pageMetadata(
	"/compare",
	"Lovable vs Bolt vs v0 vs Replit: AI builders compared",
	"Lovable, Bolt, v0, Replit, Base44, Framer, Wix, Webflow and rwaft side by side: what each makes, how you pay, and when each is the better pick."
)

export default async function ComparePage() {
	return (
		<PageShell current="/compare" crumb={{ name: "Compare", path: "/compare" }}>
			<main className="info">
				<CompareHub pricing={await getPricing()} />
			</main>
		</PageShell>
	)
}

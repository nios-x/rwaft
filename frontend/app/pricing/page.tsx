import { appJsonLd } from "../../lib/jsonld"
import { getPricing } from "../../lib/pricing"
import { PricingPlans } from "../_components/InfoSections"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

/**
 * Re-read the API's pricing hourly (lib/pricing.ts). Must be a literal: Next
 * reads segment config statically.
 */
export const revalidate = 3600

/** Says what the page says: packs are only mentioned once they can be bought. */
export async function generateMetadata() {
	const pricing = await getPricing()
	const description = !pricing.billing
		? "Every build on rwaft is free right now, and you don't need an account to start."
		: pricing.payments && pricing.packs.length > 0
			? "Free credits when you sign up, then buy credit packs with no subscription. Every chat is one complete build, and failed builds are refunded."
			: "Free credits when you sign up. Every chat is one complete build, and failed builds are refunded."
	const title = pricing.billing ? "Pricing: free credits, pay per build" : "Pricing: every build is free"
	return pageMetadata("/pricing", title, description)
}

export default async function PricingPage() {
	const pricing = await getPricing()

	return (
		<PageShell current="/pricing" crumb={{ name: "Pricing", path: "/pricing" }}>
			<JsonLd data={appJsonLd(pricing)} />
			<main className="info">
				<PricingPlans pricing={pricing} />
			</main>
		</PageShell>
	)
}

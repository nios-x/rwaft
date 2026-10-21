import { formatPrice, getPricing } from "../../lib/pricing"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site"
import { PricingPlans } from "../_components/InfoSections"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

/**
 * Re-read the API's pricing hourly (lib/pricing.ts). Must be a literal: Next
 * reads segment config statically.
 */
export const revalidate = 3600

export const metadata = pageMetadata(
	"/pricing",
	"Pricing",
	"Free credits when you sign up, then pay per chat with no subscription. Every chat is one complete build, and failed builds are refunded."
)

export default async function PricingPage() {
	const pricing = await getPricing()
	const currency = pricing.currency.toUpperCase()

	// Mirrors the visible plans exactly; no ratings or usage claims.
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"@id": `${SITE_URL}/#app`,
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Web browser",
		browserRequirements: "Requires JavaScript",
		publisher: { "@id": `${SITE_URL}/#organization` },
		offers: [
			{
				"@type": "Offer",
				name: "Free",
				price: "0",
				priceCurrency: currency,
				description: pricing.billing ? `${pricing.signupTokens} free credits on sign-up` : "Every build is free",
			},
			...(pricing.payments ? pricing.packs : []).map((pack) => ({
				"@type": "Offer",
				name: `${pack.tokens} credits`,
				price: (pack.amount / 100).toFixed(2),
				priceCurrency: currency,
				description: `${pack.tokens} credits for ${formatPrice(pack.amount, pricing.currency)}`,
			})),
		],
	}

	return (
		<PageShell current="/pricing">
			<JsonLd data={jsonLd} />
			<main className="info">
				<PricingPlans pricing={pricing} />
			</main>
		</PageShell>
	)
}

import { getPricing, formatPrice } from "../lib/pricing"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site"
import { Console } from "./_components/Console"
import { Landing, faqFor } from "./_components/Landing"
import { SiteFooter } from "./_components/SiteFooter"

/**
 * Re-read the API's pricing hourly (lib/pricing.ts). Must be a literal: Next
 * reads segment config statically.
 */
export const revalidate = 3600

/**
 * The console is interactive and lives in a client component; this server
 * page wraps it with the content that has to be in the HTML for search
 * engines: the below-the-fold sections, the footer and the structured data.
 */
export default async function Page() {
	const pricing = await getPricing()
	const faq = faqFor(pricing)
	const currency = pricing.currency.toUpperCase()

	// Mirrors the visible pricing and FAQ exactly; no ratings or usage claims.
	const jsonLd = {
		"@context": "https://schema.org",
		"@graph": [
			{
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
			},
			{
				"@type": "FAQPage",
				"@id": `${SITE_URL}/#faq`,
				mainEntity: faq.map((item) => ({
					"@type": "Question",
					name: item.question,
					acceptedAnswer: { "@type": "Answer", text: item.answer },
				})),
			},
		],
	}

	return (
		<>
			<script
				type="application/ld+json"
				// `<` is escaped so no string in the payload can close the script tag.
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
			/>
			<Console landing={<Landing pricing={pricing} faq={faq} />} footer={<SiteFooter />} />
		</>
	)
}

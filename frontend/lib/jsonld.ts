import { formatPrice, type Pricing } from "./pricing"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site"

/**
 * Structured data shared by more than one page. No ratings, reviews or usage
 * figures anywhere: none exist, and none may be invented.
 */

/** The app itself, with the plans that can be bought right now. On the home page and /pricing. */
export function appJsonLd(pricing: Pricing) {
	const currency = pricing.currency.toUpperCase()
	return {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"@id": `${SITE_URL}/#app`,
		name: SITE_NAME,
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		applicationCategory: "DeveloperApplication",
		applicationSubCategory: "AI website builder",
		operatingSystem: "Web browser",
		browserRequirements: "Requires JavaScript",
		inLanguage: "en",
		isAccessibleForFree: true,
		publisher: { "@id": `${SITE_URL}/#organization` },
		featureList: [
			"Build a website or web app from a plain-language description",
			"Watch every build step live, with the raw build log",
			"Hosting at the site's own link",
			"Change the app by sending a follow-up message",
			"Deploy a public Vite or Create React App repository",
			...(pricing.billing ? ["Failed builds are refunded automatically"] : []),
		],
		offers: [
			{
				"@type": "Offer",
				name: "Free",
				price: "0",
				priceCurrency: currency,
				description: pricing.billing
					? `${pricing.signupTokens} free credits on sign-up${pricing.weeklyTokens > 0 ? `, topped back up to ${pricing.weeklyTokens} every week` : ""}`
					: "Every build is free",
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
}

/**
 * A docs page (TechArticle) or a guide (Article). Guides carry their own
 * dates; docs follow the live product, so they're dated with the rest of the
 * explanatory pages.
 */
export function articleJsonLd(path: string, item: { heading: string; description: string }, type: "TechArticle" | "Article", dates: { published: string; updated: string }) {
	return {
		"@context": "https://schema.org",
		"@type": type,
		"@id": `${SITE_URL}${path}#article`,
		headline: item.heading,
		description: item.description,
		url: `${SITE_URL}${path}`,
		mainEntityOfPage: `${SITE_URL}${path}`,
		image: `${SITE_URL}${path}/opengraph-image`,
		datePublished: dates.published,
		dateModified: dates.updated,
		inLanguage: "en",
		author: { "@id": `${SITE_URL}/#organization` },
		publisher: { "@id": `${SITE_URL}/#organization` },
	}
}

/** A page's questions, worded exactly as they're shown. */
export function faqJsonLd(path: string, faq: { question: string; answer: string }[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		"@id": `${SITE_URL}${path}#faq`,
		mainEntity: faq.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	}
}

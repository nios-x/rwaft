import { getPricing } from "../../lib/pricing"
import { SITE_URL } from "../../lib/site"
import { FaqList, faqFor } from "../_components/InfoSections"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

/** The credits answer quotes live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

export const metadata = pageMetadata(
	"/faq",
	"AI app builder FAQ: credits, builds and hosting",
	"Answers about rwaft's AI website builder: what you can build, whether you need to code, how credits work, how long a build takes and who can see your site."
)

export default async function FaqPage() {
	const faq = faqFor(await getPricing())

	// Mirrors the visible answers exactly: both come from faqFor.
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		"@id": `${SITE_URL}/faq#faq`,
		mainEntity: faq.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	}

	return (
		<PageShell current="/faq" crumb={{ name: "FAQ", path: "/faq" }}>
			<JsonLd data={jsonLd} />
			<main className="info">
				<FaqList faq={faq} />
			</main>
		</PageShell>
	)
}

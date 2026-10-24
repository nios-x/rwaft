import { RIVALS, ROUNDUP_PATH } from "../../../lib/compare"
import { faqJsonLd } from "../../../lib/jsonld"
import { getPricing } from "../../../lib/pricing"
import { SITE_URL } from "../../../lib/site"
import { Roundup, roundupFaq } from "../../_components/Compare"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"

/** rwaft's row and the free-tier answer quote live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

export const metadata = pageMetadata(
	ROUNDUP_PATH,
	"Best AI app & website builders in 2026, compared",
	"Lovable, Bolt, v0, Replit, Base44, Framer, Wix, Webflow and rwaft: who each AI app and website builder is best for, what it costs to start, and how to choose."
)

export default async function RoundupPage() {
	const pricing = await getPricing()
	const list = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		"@id": `${SITE_URL}${ROUNDUP_PATH}#list`,
		name: "AI app and website builders",
		itemListElement: [
			{ name: "rwaft", url: SITE_URL },
			...RIVALS.map((item) => ({ name: item.name, url: `${SITE_URL}/compare/${item.slug}` })),
		].map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })),
	}

	return (
		<PageShell crumb={[{ name: "Compare", path: "/compare" }, { name: "Best AI app builders", path: ROUNDUP_PATH }]}>
			<JsonLd data={list} />
			<JsonLd data={faqJsonLd(ROUNDUP_PATH, roundupFaq(pricing))} />
			<main className="info">
				<Roundup pricing={pricing} />
			</main>
		</PageShell>
	)
}

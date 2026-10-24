import { SITE_URL } from "../../lib/site"
import { USE_CASES } from "../../lib/useCases"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"
import { UseCaseHub } from "../_components/UseCases"

export const metadata = pageMetadata(
	"/make",
	"What you can build with an AI website builder",
	"Landing pages, portfolios, restaurant menus, wedding sites, web apps and browser games: what rwaft's AI can build from a description, with example prompts."
)

export default function BuildPage() {
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		"@id": `${SITE_URL}/make#list`,
		name: "What you can build with rwaft",
		itemListElement: USE_CASES.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			url: `${SITE_URL}/make/${item.slug}`,
		})),
	}

	return (
		<PageShell current="/make" crumb={{ name: "What you can build", path: "/make" }}>
			<JsonLd data={jsonLd} />
			<main className="info">
				<UseCaseHub />
			</main>
		</PageShell>
	)
}

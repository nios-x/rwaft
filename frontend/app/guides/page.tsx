import Link from "next/link"
import { GUIDES } from "../../lib/guides"
import { SITE_URL } from "../../lib/site"
import { ArticleHub } from "../_components/Articles"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

export const metadata = pageMetadata(
	"/guides",
	"Guides to building websites and apps with AI",
	"Plain-words guides to AI website and app builders: how to build a site with AI, prompts that work, what vibe coding is, and moving a project between tools."
)

export default function GuidesPage() {
	const list = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		"@id": `${SITE_URL}/guides#list`,
		name: "Guides to building with AI",
		itemListElement: GUIDES.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			url: `${SITE_URL}/guides/${item.slug}`,
		})),
	}

	return (
		<PageShell current="/guides" crumb={{ name: "Guides", path: "/guides" }}>
			<JsonLd data={list} />
			<main className="info">
				<ArticleHub
					id="guides-title"
					title="Guides"
					lead="Building websites and apps with AI, explained in plain words, whichever tool you end up using."
					hub={{ name: "Guides", href: "/guides" }}
					items={GUIDES}
					more={<>Using rwaft already? The <Link href="/docs">docs</Link> cover it step by step.</>}
				/>
			</main>
		</PageShell>
	)
}

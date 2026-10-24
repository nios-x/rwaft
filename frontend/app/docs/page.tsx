import Link from "next/link"
import { docsFor } from "../../lib/docs"
import { getPricing } from "../../lib/pricing"
import { SITE_URL } from "../../lib/site"
import { ArticleHub } from "../_components/Articles"
import { JsonLd, PageShell, pageMetadata } from "../_components/PageShell"

/** The pages quote live pricing and the GitHub page comes and goes with it; see lib/docs.ts. */
export const revalidate = 3600

export const metadata = pageMetadata(
	"/docs",
	"Docs: build, change and share your site",
	"How to use rwaft's AI app builder: your first build, writing a good prompt, changing your site, credits, deploying a repo, and what it can't do yet."
)

export default async function DocsPage() {
	const docs = docsFor(await getPricing())
	const list = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		"@id": `${SITE_URL}/docs#list`,
		name: "rwaft docs",
		itemListElement: docs.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			url: `${SITE_URL}/docs/${item.slug}`,
		})),
	}

	return (
		<PageShell current="/docs" crumb={{ name: "Docs", path: "/docs" }}>
			<JsonLd data={list} />
			<main className="info">
				<ArticleHub
					id="docs-title"
					title="Docs"
					lead="Everything about using rwaft, in plain words: from your first build to changing it, sharing it and what it can't do yet."
					hub={{ name: "Docs", href: "/docs" }}
					items={docs}
					more={<>Looking for ideas instead? See <Link href="/make">what you can build</Link>, or the <Link href="/guides">guides</Link>.</>}
				/>
			</main>
		</PageShell>
	)
}

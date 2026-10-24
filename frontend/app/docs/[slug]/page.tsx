import { notFound } from "next/navigation"
import { DOC_SLUGS, docsFor } from "../../../lib/docs"
import { articleJsonLd } from "../../../lib/jsonld"
import { getPricing } from "../../../lib/pricing"
import { CONTENT_UPDATED } from "../../../lib/site"
import { ArticleDetail } from "../../_components/Articles"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"

/** Quotes live pricing; see lib/docs.ts. */
export const revalidate = 3600

/** Only the pages in lib/docs.ts exist; anything else is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
	return DOC_SLUGS.map((slug) => ({ slug }))
}

const findDoc = async (slug: string) => {
	const docs = docsFor(await getPricing())
	return { docs, item: docs.find((doc) => doc.slug === slug) }
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">) {
	const { item } = await findDoc((await params).slug)
	if (!item) return {}
	return pageMetadata(`/docs/${item.slug}`, item.title, item.description)
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
	// A page the live configuration has switched off (pushing to GitHub) is a 404 until it's back.
	const { docs, item } = await findDoc((await params).slug)
	if (!item) notFound()
	const path = `/docs/${item.slug}`

	return (
		<PageShell crumb={[{ name: "Docs", path: "/docs" }, { name: item.name, path }]}>
			<JsonLd data={articleJsonLd(path, item, "TechArticle", { published: CONTENT_UPDATED, updated: CONTENT_UPDATED })} />
			<main className="info">
				<ArticleDetail item={item} hub={{ name: "Docs", href: "/docs" }} siblings={docs} />
			</main>
		</PageShell>
	)
}

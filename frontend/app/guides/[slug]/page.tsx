import { notFound } from "next/navigation"
import { GUIDES, findGuide } from "../../../lib/guides"
import { articleJsonLd } from "../../../lib/jsonld"
import { ArticleDetail } from "../../_components/Articles"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"

/** Only the guides in lib/guides.ts exist; anything else is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
	return GUIDES.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">) {
	const item = findGuide((await params).slug)
	if (!item) return {}
	return pageMetadata(`/guides/${item.slug}`, item.title, item.description)
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
	const item = findGuide((await params).slug)
	if (!item) notFound()
	const path = `/guides/${item.slug}`

	return (
		<PageShell crumb={[{ name: "Guides", path: "/guides" }, { name: item.name, path }]}>
			<JsonLd data={articleJsonLd(path, item, "Article", item)} />
			<main className="info">
				<ArticleDetail item={item} hub={{ name: "Guides", href: "/guides" }} siblings={GUIDES} byline={item} />
			</main>
		</PageShell>
	)
}

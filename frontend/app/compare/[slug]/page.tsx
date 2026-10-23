import { notFound } from "next/navigation"
import { RIVALS, rival } from "../../../lib/compare"
import { faqJsonLd } from "../../../lib/jsonld"
import { getPricing } from "../../../lib/pricing"
import { CompareDetail } from "../../_components/Compare"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"

/** rwaft's column quotes live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

/** Only the rivals in lib/compare.ts exist; anything else is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
	return RIVALS.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">) {
	const item = rival((await params).slug)
	if (!item) return {}
	return pageMetadata(`/compare/${item.slug}`, item.title, item.description)
}

export default async function RivalPage({ params }: PageProps<"/compare/[slug]">) {
	const item = rival((await params).slug)
	if (!item) notFound()
	const path = `/compare/${item.slug}`

	return (
		<PageShell crumb={[{ name: "Compare", path: "/compare" }, { name: `rwaft vs ${item.name}`, path }]}>
			<JsonLd data={faqJsonLd(path, item.faq)} />
			<main className="info">
				<CompareDetail item={item} pricing={await getPricing()} />
			</main>
		</PageShell>
	)
}

import { notFound } from "next/navigation"
import { COMPARE_SLUGS, matchup, rival } from "../../../lib/compare"
import { faqJsonLd } from "../../../lib/jsonld"
import { getPricing } from "../../../lib/pricing"
import { CompareDetail, CompareMatchup } from "../../_components/Compare"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"

/** rwaft's column quotes live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

/** Only the rivals and head-to-heads in lib/compare.ts exist; anything else is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
	return COMPARE_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">) {
	const slug = (await params).slug
	const item = rival(slug) ?? matchup(slug)
	if (!item) return {}
	return pageMetadata(`/compare/${item.slug}`, item.title, item.description)
}

export default async function ComparePage({ params }: PageProps<"/compare/[slug]">) {
	const slug = (await params).slug
	const one = rival(slug)
	const pair = one ? undefined : matchup(slug)
	if (!one && !pair) notFound()
	const path = `/compare/${slug}`
	const pricing = await getPricing()

	if (pair) {
		return (
			<PageShell crumb={[{ name: "Compare", path: "/compare" }, { name: pair.title.split(":")[0], path }]}>
				<JsonLd data={faqJsonLd(path, pair.faq)} />
				<main className="info">
					<CompareMatchup item={pair} pricing={pricing} />
				</main>
			</PageShell>
		)
	}

	return (
		<PageShell crumb={[{ name: "Compare", path: "/compare" }, { name: `rwaft vs ${one!.name}`, path }]}>
			<JsonLd data={faqJsonLd(path, one!.faq)} />
			<main className="info">
				<CompareDetail item={one!} pricing={pricing} />
			</main>
		</PageShell>
	)
}

import { notFound } from "next/navigation"
import { faqJsonLd } from "../../../lib/jsonld"
import { getPricing } from "../../../lib/pricing"
import { USE_CASES, findUseCase } from "../../../lib/useCases"
import { JsonLd, PageShell, pageMetadata } from "../../_components/PageShell"
import { UseCaseDetail, faqForUseCase } from "../../_components/UseCases"

/** The cost line and the credits answer quote live pricing; see app/pricing/page.tsx. */
export const revalidate = 3600

/** Only the pages in lib/useCases.ts exist; anything else is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
	return USE_CASES.map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: PageProps<"/make/[slug]">) {
	const item = findUseCase((await params).slug)
	if (!item) return {}
	return pageMetadata(`/make/${item.slug}`, item.title, item.description)
}

export default async function UseCasePage({ params }: PageProps<"/make/[slug]">) {
	const item = findUseCase((await params).slug)
	if (!item) notFound()
	const pricing = await getPricing()
	const path = `/make/${item.slug}`

	return (
		<PageShell crumb={[{ name: "What you can build", path: "/make" }, { name: item.name, path }]}>
			{/* Mirrors the visible questions exactly: both come from faqForUseCase. */}
			<JsonLd data={faqJsonLd(path, faqForUseCase(item, pricing))} />
			<main className="info">
				<UseCaseDetail item={item} pricing={pricing} />
			</main>
		</PageShell>
	)
}

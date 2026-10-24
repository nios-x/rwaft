import { DOC_SLUGS, docsFor } from "../../../lib/docs"
import { getPricing } from "../../../lib/pricing"
import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "A page from the rwaft docs"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Rendered once per page at build time, like the page itself. */
export function generateStaticParams() {
	return DOC_SLUGS.map((slug) => ({ slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const slug = (await params).slug
	const docs = docsFor(await getPricing())
	const item = docs.find((doc) => doc.slug === slug) ?? docs[0]
	return shareCard(item.share, `From the rwaft docs: ${item.name.toLowerCase()}.`)
}

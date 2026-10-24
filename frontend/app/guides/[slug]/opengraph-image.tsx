import { GUIDES, findGuide } from "../../../lib/guides"
import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "A guide to building with AI, from rwaft"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Rendered once per page at build time, like the page itself. */
export function generateStaticParams() {
	return GUIDES.map((item) => ({ slug: item.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const item = findGuide((await params).slug) ?? GUIDES[0]
	return shareCard(item.share, "A plain-words guide from rwaft.")
}

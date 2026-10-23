import { RIVALS, rival } from "../../../lib/compare"
import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "rwaft compared with another AI app builder, side by side"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Rendered once per page at build time, like the page itself. */
export function generateStaticParams() {
	return RIVALS.map((item) => ({ slug: item.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const item = rival((await params).slug) ?? RIVALS[0]
	return shareCard([`rwaft vs ${item.name}.`, "Side by side."], "What each builds, what you see while it works, and how you pay.")
}

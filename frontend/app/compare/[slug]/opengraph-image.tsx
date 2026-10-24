import { COMPARE_SLUGS, RIVALS, matchup, matchupRivals, rival } from "../../../lib/compare"
import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "AI app builders compared side by side"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Rendered once per page at build time, like the page itself. */
export function generateStaticParams() {
	return COMPARE_SLUGS.map((slug) => ({ slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const slug = (await params).slug
	const pair = matchup(slug)
	if (pair) {
		const [a, b] = matchupRivals(pair)
		return shareCard([`${a.name} vs ${b.name}.`, "Side by side."], "What each builds, what you see while it works, and how you pay.")
	}
	const item = rival(slug) ?? RIVALS[0]
	return shareCard([`rwaft vs ${item.name}.`, "Side by side."], "What each builds, what you see while it works, and how you pay.")
}

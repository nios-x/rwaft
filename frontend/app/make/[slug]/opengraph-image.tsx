import { USE_CASES, findUseCase } from "../../../lib/useCases"
import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "rwaft: describe what you want built, watch the real build, get a live link"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Rendered once per page at build time, like the page itself. */
export function generateStaticParams() {
	return USE_CASES.map((item) => ({ slug: item.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const item = findUseCase((await params).slug) ?? USE_CASES[0]
	return shareCard(item.share, item.blurb)
}

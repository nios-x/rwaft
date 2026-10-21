import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "How rwaft's AI app builder works: describe it, watch it build, share the link"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["One sentence in.", "A live website out."], "Describe it, watch the AI plan, write and build a React app, then share its link.")
}

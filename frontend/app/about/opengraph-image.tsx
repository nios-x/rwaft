import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "About rwaft: an AI website builder that shows the real build"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["No spinner.", "The real build."], "rwaft turns plain words into a live website, and shows every step on the way there.")
}

import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "Guides to building websites and apps with AI, from rwaft"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Building with AI,", "in plain words."], "Guides to AI website and app builders, whichever one you use.")
}

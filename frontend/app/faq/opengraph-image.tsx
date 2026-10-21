import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft FAQ: what the AI app builder makes, how credits work, how long a build takes"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Questions about", "building with AI."], "What rwaft makes, how credits work, how long a build takes and who can see your site.")
}

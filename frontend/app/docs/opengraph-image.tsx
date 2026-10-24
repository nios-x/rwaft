import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft docs: how to build, change and share a site with rwaft"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["The rwaft docs,", "in plain words."], "Your first build, better prompts, changes, credits, repos and limits.")
}

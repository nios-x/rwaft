import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "The rwaft trailer: an AI website builder going from one sentence to a live link in 29 seconds"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["rwaft in", "29 seconds."], "Describe it, watch the real build, share the live link. The trailer.")
}

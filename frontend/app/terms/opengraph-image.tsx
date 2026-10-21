import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft terms of service"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Terms of service"], "Accounts, credits and refunds, acceptable use, who owns what you build, and public hosting.")
}

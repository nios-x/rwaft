import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft, Lovable, Bolt, v0, Replit, Base44, Framer, Wix and Webflow compared side by side"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["AI app builders,", "side by side."], "rwaft, Lovable, Bolt, v0, Replit and more: what each builds, what you see and how you pay.")
}

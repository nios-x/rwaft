import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../../_components/ShareCard"

export const alt = "The best AI app and website builders, by what each is best for"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["The best AI builders,", "by what you need."], "Lovable, Bolt, v0, Replit, Base44, Framer, Wix, Webflow and rwaft.")
}

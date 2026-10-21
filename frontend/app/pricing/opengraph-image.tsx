import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft pricing: free credits on sign-up, pay per build, failed builds refunded"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

/** Free of figures on purpose: prices are configured on the API and this card is rendered once. */
export default function Image() {
	return shareCard(["Start free.", "Pay per build."], "Free credits when you sign up, no subscription, and failed builds are refunded.")
}

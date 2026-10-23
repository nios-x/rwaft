import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft, Lovable, Bolt and v0 compared side by side"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Four AI app builders.", "One honest table."], "rwaft, Lovable, Bolt and v0: what each builds, what you see and how you pay.")
}

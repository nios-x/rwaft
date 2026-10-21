import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "rwaft privacy policy"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Privacy policy"], "What rwaft collects when you sign in and build, why, how long it is kept, and who else processes it.")
}

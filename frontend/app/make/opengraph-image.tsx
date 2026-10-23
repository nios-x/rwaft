import { SHARE_SIZE, SHARE_TYPE, shareCard } from "../_components/ShareCard"

export const alt = "What you can build with rwaft: sites, web apps and games from a description"
export const size = SHARE_SIZE
export const contentType = SHARE_TYPE

export default function Image() {
	return shareCard(["Sites, apps, games.", "Just describe them."], "Landing pages, portfolios, menus, wedding sites, tools and browser games, built and hosted by rwaft.")
}

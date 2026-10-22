import { rect, rectLTWH } from "../engine/spring.js"
import { BUILDS } from "./content.js"

/**
 * World-space geometry for every state of the film, in CSS px at 1×.
 * The camera decides how big it looks; these numbers decide how it is
 * composed. Text-dependent widths come from `m`, a measuring function that
 * reads the real rendered width once the fonts are loaded.
 *
 * Several states are positioned so the object that carries continuity
 * stays still in world space while the container reshapes around it: the
 * endpoint chip, the URL field, the address bar and the first build row all
 * share the same centre line (y = ENDPOINT_Y). The camera's reframing is
 * what makes it travel on screen.
 */

const ENDPOINT_Y = -90

/** The rwaft mark on its 28-unit grid (Icons.tsx): three log lines and an endpoint. */
const MARK = { x: 6.6, stroke: 2.1, lines: [[9.6, 6.4], [14, 8.9], [18.4, 5.4]], dot: [19.7, 14, 2.6], radius: 8 }

export function markParts(tile) {
	const f = (tile.r - tile.l) / 28
	const lines = MARK.lines.map(([y, len]) =>
		rectLTWH(tile.l + (MARK.x - MARK.stroke / 2) * f, tile.t + (y - MARK.stroke / 2) * f, (len + MARK.stroke) * f, MARK.stroke * f, (MARK.stroke / 2) * f))
	const dot = { cx: tile.l + MARK.dot[0] * f, cy: tile.t + MARK.dot[1] * f, r: MARK.dot[2] * f }
	return { lines, dot }
}

const tileRadius = (size) => (size * MARK.radius) / 28
const inflate = (r, by) => ({ l: r.l - by, t: r.t - by, r: r.r + by, b: r.b + by, radius: r.radius + by })
const center = (r) => ({ x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 })

export function makeLayout(m) {
	const L = {}

	/* Mark → pill */
	L.tile0 = rectLTWH(-18, -18, 36, 36, tileRadius(36))
	L.shell0 = inflate(L.tile0, 2)
	const wordW = m.wordmark
	L.pill = rect(0, 0, 10 + 36 + 13 + wordW + 22, 56, 28)
	L.tilePill = rectLTWH(L.pill.l + 10, -18, 36, 36, tileRadius(36))

	/* Deploy card */
	L.card = rect(0, 0, 640, 320, 22)
	L.tileWiden = rectLTWH(L.card.l + 24, -13, 26, 26, tileRadius(26))
	L.tile1 = rectLTWH(L.card.l + 24, L.card.t + 24, 26, 26, tileRadius(26))
	L.mode = { x: L.card.r - 24 - m.mode, y: L.card.t + 19, w: m.mode, h: 36 }
	L.heading = { x: L.card.l + 24, y: L.card.t + 88 }
	L.sub = { x: L.card.l + 24, y: L.card.t + 132 }
	L.field = rectLTWH(L.card.l + 24, L.card.t + 170, 592, 60, 14)
	L.ready = rectLTWH(L.field.r - 14 - m.ready, center(L.field).y - 13, m.ready, 26, 13)
	L.hint = { x: L.card.l + 24, cy: L.card.t + 274 }
	L.deploy = rectLTWH(L.card.r - 24 - m.deploy, L.card.t + 254, m.deploy, 40, 20)

	/* Build panel. The timeline gets headroom so its tooltip opens into
	   empty space instead of over the repo chip and status pill. */
	L.panel = rectLTWH(-340, ENDPOINT_Y - 136, 680, 546, 18)
	const chipW = 12 + 16 + 9 + m.repoRest * (14.5 / 17) + 13
	L.chip = rectLTWH(L.panel.l + 20, L.panel.t + 17, chipW, 34, 10)
	L.status = rectLTWH(L.chip.r + 10, center(L.chip).y - 12, m.building, 24, 12)
	L.statusLive = rectLTWH(L.chip.r + 10, center(L.chip).y - 12, m.live, 24, 12)
	L.elapsed = { r: L.panel.r - 22, cy: center(L.chip).y }
	L.divider1 = L.panel.t + 68
	L.nodeY = ENDPOINT_Y
	L.nodes = [60, 172, 284, 396].map((x) => L.panel.l + x)
	L.nodeLabelY = L.nodeY + 22
	L.endpoint = rectLTWH(L.panel.l + 452, L.nodeY - 16, 12 + 7 + 8 + m.host13 + 13, 32, 10)
	L.divider2 = L.panel.t + 188
	L.logX = L.panel.l + 24
	L.logY = L.panel.t + 202
	L.logStep = 21.5

	/* Success card: its URL row sits on the endpoint's line. */
	L.live = rectLTWH(-300, ENDPOINT_Y - 134, 600, 232, 20)
	L.disc = rectLTWH(L.live.l + 28, L.live.t + 28, 42, 42, 21)
	L.title = { x: L.live.l + 88, y: L.live.t + 26 }
	L.liveSub = { x: L.live.l + 88, y: L.live.t + 56 }
	L.url = rectLTWH(L.live.l + 28, ENDPOINT_Y - 28, 416, 56, 14)
	L.copy6 = rectLTWH(L.live.l + 452, ENDPOINT_Y - 28, 56, 56, 14)
	L.open6 = rectLTWH(L.live.l + 516, ENDPOINT_Y - 28, 56, 56, 14)
	L.meta = { x: L.live.l + 28, y: L.live.t + 188 }

	/* Preview: the address bar keeps the URL's line. */
	L.preview = rectLTWH(-410, ENDPOINT_Y - 32, 820, 780, 18)
	L.tabs = { x: L.preview.l + 12, y: L.preview.t + 12, w: m.tabs, h: 40 }
	L.open7 = rectLTWH(L.preview.r - 12 - 40, ENDPOINT_Y - 20, 40, 40, 11)
	L.reload7 = rectLTWH(L.open7.l - 6 - 40, ENDPOINT_Y - 20, 40, 40, 11)
	L.copy7 = rectLTWH(L.reload7.l - 6 - 40, ENDPOINT_Y - 20, 40, 40, 11)
	L.address = { l: L.tabs.x + m.tabs + 8, t: ENDPOINT_Y - 20, r: L.copy7.l - 8, b: ENDPOINT_Y + 20, radius: 11 }
	L.body = rectLTWH(L.preview.l + 12, L.preview.t + 64, 796, 704, 14)
	L.copied = { cx: center(L.copy7).x, bottom: L.copy7.t - 10 }

	/* Your builds: the first row keeps the address bar's line. */
	L.list = rectLTWH(-280, ENDPOINT_Y - 96, 560, 288, 20)
	L.listTitle = { x: L.list.l + 22, cy: L.list.t + 34 }
	L.rows = BUILDS.map((_, i) => rectLTWH(L.list.l + 16, L.list.t + 64 + i * 72, 528, 64, 14))
	L.rowDots = L.rows.map((row) => ({ cx: row.l + 66 + 12, cy: row.t + 37 + 11 }))

	/* Mark again: where rows and dots land. */
	L.final = markParts(L.tile0)

	/* Cursor targets */
	const field = center(L.field)
	L.cursor = {
		home: [330, 300],
		field: [L.field.l + 176, field.y + 4],
		aside: [L.field.l + 318, L.card.t + 266],
		deploy: [center(L.deploy).x + 6, center(L.deploy).y + 4],
		nearTimeline: [L.panel.l + 226, L.nodeY + 52],
		node: [L.nodes[1] + 1, L.nodeY + 2],
		log: [L.panel.l + 612, L.logY + 9.6 * L.logStep],
		url: [L.url.l + 150, ENDPOINT_Y + 5],
		afterClick: [L.url.l + 196, ENDPOINT_Y + 92],
		copy: [center(L.copy7).x + 2, ENDPOINT_Y + 4],
	}

	/* Camera framing per state, as { cx, cy, w, h } of what must fit. */
	const frame = (r) => ({ ...center(r), w: r.r - r.l, h: r.b - r.t })
	L.frames = {
		mark: frame(L.tile0),
		pill: frame(L.pill),
		card: frame(L.card),
		panel: frame(L.panel),
		live: frame(L.live),
		preview: frame(L.preview),
		list: frame(L.list),
	}

	return L
}

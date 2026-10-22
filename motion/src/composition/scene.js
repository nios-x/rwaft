import { css, h, place, text } from "../engine/dom.js"
import { clamp, ease, lerp, mixColor, progress, stops, bump } from "../engine/math.js"
import { rectTrack, spring, springAt, springs, track, pulseTrack } from "../engine/spring.js"
import { enter, exit, presence, fxStyle, combine } from "../engine/transitions.js"
import { cameraAt, cameraTransform, fitScale, worldToScreen } from "../engine/camera.js"
import { cursorPath } from "../engine/cursor.js"
import { clock, elapsed } from "../engine/count.js"
import { DURATION, T, grid, sceneAt } from "./beatmap.js"
import { makeLayout, markParts } from "./layout.js"
import { icons } from "./icons.js"
import { BUILDS, CLOCK_BASE, ELAPSED, FILL, LIVE_HOST, LOG, REPO, STAGES, TOOLTIP } from "./content.js"
import { buildSite } from "./site.js"

/**
 * The film. createScene() builds the DOM once; seek(t) computes every
 * property from t alone and writes it. Nothing reads the previous frame.
 *
 * Organised by the object that carries continuity:
 *   shell       the primary container (mark → pill → card → panel → card → preview → list → mark)
 *   lockup      tile, wordmark and the mark's lines and dot
 *   field       URL field → repo chip
 *   action      Deploy button → Building / Live status pill
 *   timeline    stage nodes and track; node 4 becomes the success disc
 *   endpoint    URL chip → URL field → address bar → first build row → the mark's first line
 *   rows        build rows 2 and 3 → the mark's other two lines; their Live dots → the endpoint dot
 */

const C = {
	surface: "#131316",
	surface2: "#1b1b1f",
	surface3: "#26262b",
	line: "#24242a",
	lineStrong: "#34343b",
	text: "#fafafa",
	text2: "#a8a8b2",
	text3: "#8b8b95",
	ink: "#fafafa",
	onInk: "#0a0a0b",
	accent: "#8b72ff",
	accentInk: "#b9a9ff",
	buildC: "#f97316",
	buildSoft: "rgba(249,115,22,0.14)",
	liveC: "#22c55e",
	liveSoft: "rgba(34,197,94,0.13)",
	markLine: "#0a0a0b",
}

/** Outro springs are tuned to land before 16.00 s so the loop is exact. */
const S = {
	...springs,
	/** Expansions: the camera starts pulling back a hair before the object grows. */
	camFast: spring(0.55, 0.96),
	quickFade: spring(0.2, 1),
	outro: spring(0.5, 0.9),
	outroLine: spring(0.46, 0.88),
	/** Rows lose their height first, so they read as thinning into lines. */
	thin: spring(0.26, 0.92),
	lineLength: spring(0.38, 0.9),
	dotIn: spring(0.36, 0.9),
	bloom: spring(0.36, 0.82),
	camOut: spring(0.62, 0.97),
}

/** Before this the lines and dot ride on the lockup's tile; after it they lead their own lives. */
const DETACH = T.deploy + 0.3

const ICON = (name, className = "ico") => `<span class="${className}">${icons[name]}</span>`

/* ── Measuring ─────────────────────────────────────────────────────────── */

function measureAll() {
	const host = h("div", null, document.body)
	host.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden"
	const width = (el) => {
		host.appendChild(el)
		el.style.position = "absolute"
		el.style.whiteSpace = "nowrap"
		return el.getBoundingClientRect().width
	}
	const span = (className, content) => {
		const el = document.createElement("span")
		el.className = className
		el.innerHTML = content
		return el
	}
	const m = {
		wordmark: width(span("wordmark", "rwaft")),
		mode: width(modeSwitch()),
		ready: width(span("ready", `${icons.check}Ready`)),
		deploy: width(span("action-label", "Deploy")) + 44,
		repoHost: width(span("repo-text", REPO.host)),
		repoRest: width(span("repo-text", `<span class="repo-owner">${REPO.owner}</span><span class="repo-name">${REPO.name}</span>`)),
		building: 9 + 6 + 6 + width(span("status-label", "Building")) + 11,
		live: 9 + 6 + 6 + width(span("status-label", "Live")) + 11,
		host13: width(span("endpoint-text", LIVE_HOST)),
		tabs: width(tabsEl()),
	}
	host.remove()
	return m
}

function modeSwitch() {
	const el = h("div", "mode")
	el.innerHTML = `<span>${icons.spark}Describe an app</span><span data-on>${icons.repo}GitHub repo</span>`
	return el
}

function tabsEl() {
	const el = h("div", "tabs")
	el.innerHTML = `<span data-on>Preview</span><span>Log<b class="tab-count">${LOG.length}</b></span>`
	return el
}

/* ── Scene ─────────────────────────────────────────────────────────────── */

export function createScene(stage, view) {
	const m = measureAll()
	const L = makeLayout(m)

	css(stage, { width: `${view.width}px`, height: `${view.height}px` })
	const bg = h("div", "bg", stage)
	const bgGlow = h("div", "bg-glow", bg)
	h("div", "bg-vignette", bg)
	h("div", "bg-grain", bg)

	const world = h("div", "world", stage)
	const shellShadow = h("div", "shell-shadow", world)
	const shell = h("div", "shell", world)
	const shellBg = h("div", "shell-bg", shell)
	const inner = h("div", "shell-inner", shell)
	const overlay = h("div", "overlay", world)
	const cursorLayer = h("div", "cursor-layer", stage)

	/* Deploy card */
	const heading = h("div", "heading", inner, "Deploy from GitHub")
	const sub = h("div", "sub", inner, "Paste a public repository. rwaft builds it and gives you a live link.")
	const mode = modeSwitch()
	inner.appendChild(mode)
	const hint = h("div", "hint", inner, "Vite and Create React App projects")

	const field = h("div", "field", inner)
	const fieldRing = h("div", "field-ring", field)
	const fieldFocus = h("div", "field-focus", field)
	const gh = h("div", "gh", field, icons.github)
	const placeholder = h("div", "placeholder", field, "Paste a public GitHub repository URL…")
	const repoHost = h("div", "repo-text", field, `<span class="repo-host">${REPO.host}</span>`)
	const repoRest = h("div", "repo-text", field, `<span class="repo-owner">${REPO.owner}</span><span class="repo-name">${REPO.name}</span>`)
	const caret = h("div", "caret", field)
	const ready = h("div", "ready", field, `${icons.check}Ready`)

	const action = h("div", "action", inner)
	const actionLabel = h("div", "action-label", action, "Deploy")
	const statusBuilding = h("div", "status-label", action, `<span class="status-dot"></span>Building`)
	const statusLive = h("div", "status-label", action, `<span class="status-dot"></span>Live`)
	const buildingDot = statusBuilding.firstElementChild

	/* Build panel */
	const elapsedEl = h("div", "elapsed", inner, `${icons.clock}<span>0:00</span>`)
	const elapsedText = elapsedEl.lastElementChild
	const divider1 = h("div", "divider", inner)
	const divider2 = h("div", "divider", inner)
	const trackTodo = h("div", "track-todo", inner)
	const trackDone = h("div", "track-done", inner)
	const trackHead = h("div", "track-head", inner)
	const halo = h("div", "hover-halo", inner)
	const nodes = STAGES.map((stageInfo, i) => {
		const el = h("div", "node", inner)
		const pending = h("div", "node-pending", el)
		const live = h("div", "node-live", el)
		const core = h("div", "node-core", live)
		const done = h("div", "node-done", el, icons.checkBold)
		const label = h("div", "node-label", inner, stageInfo.label)
		return { el, pending, live, core, done, check: done.querySelector("path"), label, labelW: 0, i }
	})
	const discCheck = h("div", "disc", nodes[3].el, icons.checkBold)
	css(discCheck, { inset: "0" })
	const discPath = discCheck.querySelector("path")

	const logLines = LOG.map((line) => {
		const el = h("div", "log-line", inner)
		el.dataset.level = line.level ?? "info"
		el.innerHTML = `<span class="log-time">${clock(CLOCK_BASE, line.s)}</span><span class="log-msg">${line.tick ? icons.check : ""}${line.msg}</span>`
		return el
	})

	/* Success card */
	const title = h("div", "title", inner, "Your site is live.")
	const liveSub = h("div", "sub", inner, "Share the link with anyone.")
	const meta = h("div", "meta", inner, `Built from ${REPO.owner}${REPO.name} in 0:24`)
	const iconBtn = (name) => {
		const el = h("div", "icon-btn", inner, ICON(name))
		return { el, icon: el.firstElementChild }
	}
	const copyBtn = iconBtn("copy")
	const copyCheck = h("span", "ico", copyBtn.el, icons.check)
	css(copyCheck, { color: C.liveC })
	const openBtn = iconBtn("external")
	const reloadBtn = iconBtn("refresh")

	/* Preview */
	const tabs = tabsEl()
	inner.appendChild(tabs)
	const body = h("div", "body", inner)
	const site = buildSite(body)

	/* Your builds */
	const listTitle = h("div", "builds-title", inner, "Your builds")
	const rowContent = BUILDS.map((build) => {
		const icon = h("div", "row-icon", inner, ICON(build.icon))
		const titleEl = h("div", "row-title", inner, build.title)
		const metaEl = h("div", "row-meta", inner, `<span class="pill-live">Live</span><span>${build.kind} · ${build.when}</span>`)
		return { icon, title: titleEl, meta: metaEl }
	})

	/* Threads: the endpoint, the lockup, the rows-as-lines and the dots */
	const tile = h("div", "tile", inner)
	const wordmark = h("div", "wordmark", inner, "rwaft")
	const endpoint = h("div", "endpoint", inner)
	const endpointRing = h("div", "field-ring", endpoint)
	const endpointDot = h("div", "endpoint-dot", endpoint)
	const endpointText = h("div", "endpoint-text", endpoint, LIVE_HOST)
	const underline = h("div", "underline", endpoint)
	const rowBoxes = [1, 2].map(() => {
		const el = h("div", "row-box", inner)
		const ring = h("div", "field-ring", el)
		return { el, ring }
	})
	const dots = [0, 1, 2].map(() => h("div", "mark-dot", inner))
	const ping = h("div", "ping", inner)

	/* Overlays: not clipped by the shell */
	const tooltip = h("div", "tooltip", overlay, `
		<div class="tip-row"><span class="tip-title">${TOOLTIP.title}</span><span class="tip-value">${TOOLTIP.value}</span></div>
		<div class="tip-detail">${TOOLTIP.detail}</div>
		<i class="tip-arrow"></i>`)
	const copied = h("div", "copied", overlay, `${icons.check}Link copied`)

	/* Cursor */
	const cursorEl = h("div", "cursor", cursorLayer, `<svg viewBox="0 0 24 24"><path d="M5.2 2.6 5.3 19.4c0 .7.8 1 1.3.5l3.9-3.9 2.6 5.8c.2.5.8.7 1.3.5l2-.9c.5-.2.7-.8.5-1.3l-2.6-5.7 5.4-.4c.7-.1 1-.9.5-1.4L6.6 1.9c-.5-.5-1.4-.1-1.4.7Z" fill="#fff" stroke="#0a0a0b" stroke-width="1.3" stroke-linejoin="round"/></svg>`)
	const clickRing = h("div", "click-ring", cursorLayer)

	/* Measure what only exists once the DOM is built */
	for (const node of nodes) node.labelW = node.label.getBoundingClientRect().width
	const titleW = title.getBoundingClientRect().width
	const endpointTextW = m.host13
	const tooltipBox = { w: tooltip.getBoundingClientRect().width, h: tooltip.getBoundingClientRect().height }
	const copiedW = copied.getBoundingClientRect().width
	const rowTitleY = 15
	void titleW

	/* ── Static placements ──────────────────────────────────────────────── */

	css(heading, { left: `${L.heading.x}px`, top: `${L.heading.y}px` })
	css(sub, { left: `${L.sub.x}px`, top: `${L.sub.y}px` })
	css(mode, { left: `${L.mode.x}px`, top: `${L.mode.y}px` })
	css(hint, { left: `${L.hint.x}px`, top: `${L.hint.cy - 10}px` })
	css(divider1, { left: `${L.panel.l}px`, top: `${L.divider1}px`, width: `${L.panel.r - L.panel.l}px` })
	css(divider2, { left: `${L.panel.l}px`, top: `${L.divider2}px`, width: `${L.panel.r - L.panel.l}px` })
	LOG.forEach((_, i) => css(logLines[i], { left: `${L.logX}px`, top: `${L.logY + i * L.logStep}px` }))
	nodes.forEach((node) => css(node.label, { top: `${L.nodeLabelY}px` }))
	css(title, { left: `${L.title.x}px`, top: `${L.title.y}px` })
	css(liveSub, { left: `${L.liveSub.x}px`, top: `${L.liveSub.y}px` })
	css(meta, { left: `${L.meta.x}px`, top: `${L.meta.y}px` })
	css(tabs, { left: `${L.tabs.x}px`, top: `${L.tabs.y}px` })
	place(body, L.body)
	place(reloadBtn.el, L.reload7)
	css(listTitle, { left: `${L.listTitle.x}px`, top: `${L.listTitle.cy - 9}px` })
	rowContent.forEach((row, i) => {
		const r = L.rows[i]
		css(row.icon, { left: `${r.l + 12}px`, top: `${r.t + 12}px`, width: "40px", height: "40px" })
		css(row.title, { left: `${r.l + 66}px`, top: `${r.t + rowTitleY}px` })
		css(row.meta, { left: `${r.l + 66}px`, top: `${r.t + 37}px` })
	})
	const iconInBtn = (btn, size) => css(btn.icon, { left: `${(size - 17) / 2}px`, top: `${(size - 17) / 2}px` })
	iconInBtn(reloadBtn, 40)

	/* ── Choreography that does not depend on t ─────────────────────────── */

	const fit = (frame, cap = 3.8) => Math.min(cap, fitScale(frame.w, frame.h, view, view.fill))
	const F = L.frames
	// Growing states: the camera leads by 80 ms so nothing outruns the frame.
	// Shrinking states: it trails by 40 ms so the object visibly leads.
	const grow = { spring: S.camFast, delay: -0.08 }
	const cameraKeys = [
		{ at: 0, cx: F.mark.x, cy: F.mark.y, s: 3.8 },
		{ at: T.pill, cx: F.pill.x, cy: F.pill.y, s: fit(F.pill, 3.15), ...grow },
		{ at: T.widen, cx: F.card.x, cy: F.card.y, s: fit(F.card), ...grow },
		{ at: T.deploy, cx: F.panel.x, cy: F.panel.y, s: fit(F.panel), ...grow },
		{ at: T.morph, cx: F.live.x, cy: F.live.y, s: fit(F.live) },
		{ at: T.open2, cx: F.preview.x, cy: F.preview.y, s: fit(F.preview), ...grow },
		{ at: T.fold, cx: F.list.x, cy: F.list.y, s: fit(F.list) },
		{ at: T.collapse, cx: F.mark.x, cy: F.mark.y, s: 3.8, spring: S.camOut, delay: 0.02 },
	]

	/** A build row becoming a log line: height goes first, then length, rows staggered top-down. */
	function thinning(i) {
		const d = i * 0.025
		return {
			t: { spring: S.thin, delay: d },
			b: { spring: S.thin, delay: d },
			radius: { spring: S.thin, delay: d },
			l: { spring: S.lineLength, delay: d + 0.04 },
			r: { spring: S.lineLength, delay: d + 0.02 },
		}
	}

	const shellStates = [
		{ rect: L.shell0 },
		{ at: T.pill, rect: L.pill, edges: { r: { spring: S.lead }, l: { spring: S.trail, delay: 0.03 }, t: { spring: S.ui }, b: { spring: S.ui }, radius: { spring: S.ui } } },
		{ at: T.widen, rect: { ...L.pill, l: L.card.l, r: L.card.r }, edges: { r: { spring: S.lead }, l: { spring: S.trail, delay: 0.05 } } },
		{ at: T.open, rect: L.card, edges: { t: { spring: S.lead }, b: { spring: S.heavy, delay: 0.02 }, radius: { spring: S.ui } } },
		{ at: T.deploy + 0.04, rect: L.panel, edges: { t: { spring: S.lead }, b: { spring: S.heavy, delay: 0.03 }, l: { spring: S.morph }, r: { spring: S.morph }, radius: { spring: S.ui } } },
		{ at: T.morph, rect: L.live, edges: { b: { spring: S.lead }, t: { spring: S.trail, delay: 0.05 }, l: { spring: S.morph, delay: 0.03 }, r: { spring: S.morph, delay: 0.03 }, radius: { spring: S.ui } } },
		{ at: T.open2 + 0.04, rect: L.preview, edges: { t: { spring: S.lead }, b: { spring: S.heavy, delay: 0.05 }, l: { spring: S.morph }, r: { spring: S.morph }, radius: { spring: S.ui } } },
		{ at: T.fold, rect: L.list, edges: { b: { spring: S.lead }, t: { spring: S.trail, delay: 0.05 }, l: { spring: S.morph, delay: 0.02 }, r: { spring: S.morph, delay: 0.02 }, radius: { spring: S.ui } } },
		{ at: T.collapse, rect: L.shell0, edges: { all: { spring: S.outro }, l: { spring: S.outro }, r: { spring: S.outro, delay: 0.03 }, t: { spring: S.outro, delay: 0.01 }, b: { spring: S.outro, delay: 0.05 }, radius: { spring: S.outro } } },
	]

	const tileStates = [
		{ rect: L.tile0 },
		{ at: T.pill, rect: L.tilePill, edges: { all: { spring: S.trail, delay: 0.03 } } },
		{ at: T.widen, rect: L.tileWiden, edges: { all: { spring: S.trail, delay: 0.05 } } },
		{ at: T.open, rect: L.tile1, edges: { all: { spring: S.lead } } },
	]

	const fieldStates = [
		{ rect: L.field },
		{ at: T.deploy + 0.05, rect: L.chip, edges: { all: { spring: S.morph }, b: { spring: S.morph, delay: 0.02 } } },
	]

	const actionStates = [
		{ rect: L.deploy },
		{ at: T.deploy + 0.07, rect: L.status, edges: { all: { spring: S.morph }, l: { spring: S.morph, delay: 0.02 } } },
		{ at: T.live + 0.22, rect: L.statusLive, edges: { all: { spring: S.ui } } },
	]

	const endpointStates = [
		{ rect: L.endpoint },
		{ at: T.morph + 0.1, rect: L.url, edges: { all: { spring: S.morph }, l: { spring: S.lead }, b: { spring: S.morph, delay: 0.03 } } },
		{ at: T.open2 + 0.06, rect: L.address, edges: { all: { spring: S.morph }, t: { spring: S.lead } } },
		{ at: T.fold + 0.04, rect: L.rows[0], edges: { all: { spring: S.morph }, b: { spring: S.morph, delay: 0.03 } } },
		{ at: T.collapse + 0.02, rect: L.final.lines[0], edges: thinning(0) },
	]

	const discStates = [
		{ rect: { l: L.nodes[3] - 9, t: L.nodeY - 9, r: L.nodes[3] + 9, b: L.nodeY + 9, radius: 9 } },
		{ at: T.morph + 0.08, rect: L.disc, edges: { all: { spring: S.morph } } },
	]

	const copyStates = [
		{ rect: L.copy6 },
		{ at: T.open2 + 0.06, rect: L.copy7, edges: { all: { spring: S.morph } } },
	]
	const openStates = [
		{ rect: L.open6 },
		{ at: T.open2 + 0.06, rect: L.open7, edges: { all: { spring: S.morph }, l: { spring: S.morph, delay: 0.02 } } },
	]

	const cursor = cursorPath({
		home: L.cursor.home,
		moves: [
			{ at: T.cursorIn, dur: 0.44, to: L.cursor.field, arc: 0.16 },
			{ at: T.focus + 0.12, dur: 0.36, to: L.cursor.aside, arc: -0.22, overshoot: 0.01 },
			{ at: T.ready + 0.05, dur: 0.39, to: L.cursor.deploy, arc: 0.14 },
			{ at: T.inspectMove + 0.04, dur: 0.5, to: L.cursor.nearTimeline, arc: -0.12 },
			{ at: T.hover - 0.3, dur: 0.3, to: L.cursor.node, arc: 0.12, overshoot: 0.02 },
			{ at: T.unhover + 0.04, dur: 0.5, to: L.cursor.log, arc: 0.14 },
			{ at: T.actions + 0.04, dur: 0.46, to: L.cursor.url, arc: -0.16 },
			{ at: T.open2 + 0.3, dur: 0.42, to: L.cursor.afterClick, arc: 0.1, overshoot: 0.006 },
			{ at: T.toCopy + 0.02, dur: 0.42, to: L.cursor.copy, arc: -0.18 },
			{ at: T.settle + 0.02, dur: 0.62, to: L.cursor.home, arc: -0.12, overshoot: 0 },
		],
		clicks: [T.focus, T.deploy, T.open2, T.copy],
		shows: [{ at: T.cursorIn - 0.05, dur: 0.18, to: 1, from: 0 }, { at: T.settle + 0.4, dur: 0.24, to: 0 }],
	})

	/**
	 * A row's fill: its surface, a light log-line grey that arrives only as the
	 * row gets thin (so it never reads as a grey slab), then ink once the white
	 * tile is behind it.
	 */
	const lineLook = (t, i, height) => {
		const thinness = t > T.collapse ? 1 - clamp((height - 5) / 24) : 0
		let look = mixColor(C.surface2, "rgba(168,168,178,0.72)", thinness)
		look = mixColor(look, C.markLine, springAt(t, T.collapse + 0.3 + i * 0.02, S.fade))
		return look
	}

	const fillX = (f) => {
		const xs = [...L.nodes, L.endpoint.l]
		const i = Math.min(3, Math.floor(f))
		return lerp(xs[i], xs[i + 1], f - i)
	}

	/* ── seek ───────────────────────────────────────────────────────────── */

	let last = null

	function seek(input) {
		const t = grid.wrap(input)
		const cam = cameraAt(t, cameraKeys, { duration: DURATION })

		/* Camera and background */
		css(world, { transform: cameraTransform(cam, view) })
		css(bgGlow, { transform: `translate(${(-cam.cx * 0.06).toFixed(2)}px, ${(-cam.cy * 0.06).toFixed(2)}px)` })

		/* Shell */
		const sh = rectTrack(t, shellStates)
		const shellOpacity = track(t, 0, [{ at: T.pill, to: 1, spring: S.fade }, { at: T.collapse + 0.42, to: 0, spring: S.fade }])
		place(shell, sh)
		place(shellShadow, sh, undefined, { opacity: clamp(shellOpacity).toFixed(3) })
		css(shellBg, { opacity: clamp(shellOpacity).toFixed(3) })
		css(inner, { left: `${(-sh.l).toFixed(3)}px`, top: `${(-sh.t).toFixed(3)}px` })

		/* Lockup: tile and wordmark */
		const tileRect = rectTrack(t, tileStates)
		const lockupFx = exit(t, T.deploy - 0.02, { dur: 0.16, y: -4, scale: 1 })
		if (t < T.collapse) {
			place(tile, tileRect, undefined, fxStyle(lockupFx))
		} else {
			const bloom = track(t, 0.7, [{ at: T.collapse + 0.32, to: 1, spring: S.bloom }])
			const o = ease.cubicOut(progress(t, T.collapse + 0.32, T.collapse + 0.42))
			place(tile, L.tile0, undefined, { ...fxStyle({ o, x: 0, y: 0, s: bloom, blur: 0 }) })
		}
		const tileSize = tileRect.r - tileRect.l
		const wordScale = (tileSize / 36) ** 0.85
		const wordFx = combine(enter(t, T.pill + 0.06, { x: -10, y: 0, blur: 4, dur: 0.36, scale: 1 }), lockupFx)
		css(wordmark, {
			left: `${(tileRect.r + 13 * (tileSize / 36)).toFixed(3)}px`,
			top: `${((tileRect.t + tileRect.b) / 2 - 12.5 + 0.5).toFixed(3)}px`,
			...fxStyle(wordFx, `scale(${wordScale.toFixed(4)})`),
		})

		/* The mark's lines and dot, attached to the tile until DETACH */
		const parts = markParts(tileRect)
		const markLook = (el, ring) => {
			css(el, { background: C.markLine })
			if (ring) css(ring, { opacity: "0" })
		}

		/* Ping: the endpoint "goes live" once at the top of the loop */
		{
			const u = progress(t, T.ping + 0.02, T.ping + 0.62)
			const r = lerp(parts.dot.r, parts.dot.r * 3.4, ease.expoOut(u))
			css(ping, {
				left: `${(parts.dot.cx - r).toFixed(3)}px`, top: `${(parts.dot.cy - r).toFixed(3)}px`,
				width: `${(2 * r).toFixed(3)}px`, height: `${(2 * r).toFixed(3)}px`,
				opacity: (0.7 * bump(u * 0.5 + 0.08) * (1 - u)).toFixed(3),
				borderWidth: `${(1.2 * (tileSize / 36)).toFixed(3)}px`,
			})
		}

		/* ── Deploy card ──────────────────────────────────────────────────── */

		css(heading, fxStyle(presence(t, T.open + 0.12, T.deploy, { y: 10, blur: 4, dur: 0.34 }, { dur: 0.12 })))
		css(sub, fxStyle(presence(t, T.open + 0.18, T.deploy + 0.01, { y: 8, dur: 0.3 }, { dur: 0.12 })))
		css(mode, fxStyle(presence(t, T.open + 0.14, T.deploy, { y: 6, x: 6 }, { dur: 0.12 })))
		css(hint, fxStyle(presence(t, T.open + 0.28, T.deploy, { y: 6 }, { dur: 0.1 })))

		/* Field → repo chip */
		{
			const box = rectTrack(t, fieldStates)
			const k = springAt(t, T.deploy + 0.05, S.morph)
			const fx = presence(t, T.open + 0.22, T.morph, { y: 10, scale: 0.985, blur: 2, dur: 0.34 }, { dur: 0.14 })
			const hover = pulseTrack(t, T.focus - 0.08, T.focus, S.fade)
			place(field, box, undefined, fxStyle(fx))
			css(fieldRing, { boxShadow: `inset 0 0 0 1px ${mixColor(C.line, C.lineStrong, clamp(hover))}` })
			css(fieldFocus, { opacity: clamp(pulseTrack(t, T.focus + 0.02, T.deploy + 0.02, S.fade)).toFixed(3) })

			const h0 = box.b - box.t
			const ghSize = lerp(20, 16, k)
			const filled = springAt(t, T.paste + 0.08, S.fade)
			css(gh, {
				left: `${lerp(18, 12, k).toFixed(3)}px`, top: `${((h0 - ghSize) / 2).toFixed(3)}px`,
				width: `${ghSize.toFixed(3)}px`, height: `${ghSize.toFixed(3)}px`,
				color: mixColor(C.text3, C.text2, filled),
			})

			const textX = lerp(52, 37, k)
			const textScale = lerp(1, 14.5 / 17, k)
			const baseTop = h0 / 2 - 8.5
			css(placeholder, { left: `${textX}px`, top: `${baseTop.toFixed(3)}px`, ...fxStyle(presence(t, T.open + 0.3, T.paste - 0.04, { y: 0, x: 4 }, { dur: 0.08, y: 0 })) })

			// The paste reveals left to right, then "github.com/" folds away into the chip.
			const total = m.repoHost + m.repoRest
			const reveal = total * ease.cubicOut(progress(t, T.paste, T.paste + 0.2))
			const pasteBlur = 2.5 * (1 - ease.cubicOut(progress(t, T.paste, T.paste + 0.16)))
			const hostShown = clamp(reveal / m.repoHost)
			const restShown = clamp((reveal - m.repoHost) / m.repoRest)
			const hostFx = exit(t, T.deploy + 0.02, { dur: 0.12, y: 0, x: -4 })
			const shift = m.repoHost * ease.cubicInOut(progress(t, T.deploy + 0.04, T.deploy + 0.3))
			css(repoHost, {
				left: `${textX}px`, top: `${baseTop.toFixed(3)}px`,
				clipPath: `inset(-4px ${((1 - hostShown) * 100).toFixed(2)}% -4px -2px)`,
				...fxStyle({ ...hostFx, blur: hostFx.blur + pasteBlur }, `scale(${textScale.toFixed(4)})`),
				visibility: t >= T.paste ? hostFx.o > 0.001 ? "visible" : "hidden" : "hidden",
			})
			css(repoRest, {
				left: `${(textX + (m.repoHost - shift) * textScale).toFixed(3)}px`, top: `${baseTop.toFixed(3)}px`,
				clipPath: `inset(-4px ${((1 - restShown) * 100).toFixed(2)}% -4px -2px)`,
				transform: `scale(${textScale.toFixed(4)})`,
				filter: pasteBlur > 0.05 ? `blur(${pasteBlur.toFixed(2)}px)` : "none",
				visibility: t >= T.paste ? "visible" : "hidden",
			})

			// Caret: blinks at rest, solid while text is arriving.
			const lastEdit = t < T.paste ? T.focus : T.paste + 0.2
			const blinkOn = t - lastEdit < 0.45 || Math.floor((t - lastEdit - 0.45) / 0.5) % 2 === 1
			const caretX = textX + (t < T.paste ? -1 : reveal + 1.5)
			css(caret, {
				left: `${caretX.toFixed(3)}px`, top: `${(h0 / 2 - 11).toFixed(3)}px`, height: "22px",
				opacity: t >= T.focus + 0.02 && t < T.deploy + 0.02 && blinkOn ? "1" : "0",
			})

			css(ready, {
				left: `${L.ready.l - L.field.l}px`, top: `${(h0 - 26) / 2}px`,
				...fxStyle(presence(t, T.ready, T.deploy, { spring: S.pop, scale: 0.8, y: 0, x: 6, dur: 0.3 }, { dur: 0.1 })),
			})
		}

		/* Deploy → Building → Live */
		{
			const box = rectTrack(t, actionStates)
			const enabled = lerp(0.32, 1, springAt(t, T.ready + 0.03, S.fade))
			const fx = presence(t, T.open + 0.32, T.morph + 0.02, { y: 8 }, { dur: 0.14 })
			const press = cursor.at(t).press * (t < T.deploy + 0.3 && t > T.deploy - 0.2 ? 1 : 0)
			let bgColor = mixColor(C.ink, C.buildSoft, springAt(t, T.deploy + 0.06, S.quickFade))
			bgColor = mixColor(bgColor, C.liveSoft, springAt(t, T.live + 0.22, S.fade))
			place(action, box, undefined, {
				background: bgColor,
				...fxStyle({ ...fx, o: fx.o * enabled }, `scale(${(1 - 0.05 * press).toFixed(4)})`),
			})
			const hgt = box.b - box.t
			const wdt = box.r - box.l
			css(actionLabel, {
				left: `${((wdt - (m.deploy - 44)) / 2).toFixed(3)}px`, top: `${(hgt / 2 - 7).toFixed(3)}px`,
				...fxStyle(exit(t, T.deploy + 0.03, { dur: 0.1, y: 0, scale: 0.9 })),
			})
			const buildingFx = presence(t, T.deploy + 0.16, T.live + 0.18, { x: -6, y: 0, blur: 2 }, { dur: 0.12, y: 0 })
			css(statusBuilding, { left: "9px", top: `${(hgt / 2 - 6).toFixed(3)}px`, color: "#fdba74", ...fxStyle(buildingFx) })
			const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (t - T.deploy - 0.16)) / 1.2))
			css(buildingDot, { opacity: pulse.toFixed(3) })
			css(statusLive, { left: "9px", top: `${(hgt / 2 - 6).toFixed(3)}px`, color: "#86efac", ...fxStyle(enter(t, T.live + 0.26, { x: -6, y: 0, blur: 2 })) })
		}

		/* ── Build panel ──────────────────────────────────────────────────── */

		const panelOut = T.morph
		css(elapsedEl, {
			left: `${L.elapsed.r}px`, top: `${L.elapsed.cy - 10}px`,
			...fxStyle(presence(t, T.deploy + 0.22, panelOut, { x: 8, y: 0 }, { dur: 0.12 }), "translateX(-100%)"),
		})
		text(elapsedText, elapsed(stops(t, ELAPSED)))
		css(divider1, fxStyle(presence(t, T.deploy + 0.2, panelOut, { y: 0, blur: 0, scale: 1 }, { dur: 0.12, y: 0, scale: 1, blur: 0 })))
		css(divider2, fxStyle(presence(t, T.timeline - 0.14, panelOut, { y: 0, blur: 0, scale: 1 }, { dur: 0.12, y: 0, scale: 1, blur: 0 })))

		/* Timeline: the graph. It draws itself, its last node becomes the success disc. */
		const converge = ease.cubicInOut(progress(t, T.morph + 0.02, T.morph + 0.26))
		const fill = stops(t, FILL, ease.sineInOut)
		{
			const x0 = L.nodes[0]
			const xEnd = L.endpoint.l
			const x3 = L.nodes[3]
			const draw = ease.cubicInOut(progress(t, T.timeline - 0.14, T.timeline + 0.3))
			const y = L.nodeY - 1
			const fx = presence(t, T.timeline - 0.14, null, { y: 0, blur: 0, scale: 1, dur: 0.2 })
			const doneR = lerp(fillX(fill), x3, converge)
			const doneL = lerp(x0, x3, converge)
			const gone = 1 - progress(t, T.morph + 0.12, T.morph + 0.24)
			css(trackTodo, {
				left: `${x0}px`, top: `${y}px`, width: `${Math.max(0, (xEnd - x0) * draw).toFixed(3)}px`,
				opacity: (fx.o * (t < T.morph ? 1 : 1 - progress(t, T.morph, T.morph + 0.1))).toFixed(3),
			})
			css(trackDone, {
				left: `${doneL.toFixed(3)}px`, top: `${y}px`, width: `${Math.max(0, doneR - doneL).toFixed(3)}px`,
				opacity: (fx.o * gone).toFixed(3),
			})
			const headW = Math.min(46, Math.max(0, fillX(fill) - x0))
			const building = t > T.timeline && t < T.live
			css(trackHead, {
				left: `${(fillX(fill) - headW).toFixed(3)}px`, top: `${y}px`, width: `${headW.toFixed(3)}px`,
				opacity: building ? (fx.o * (1 - progress(t, T.live - 0.12, T.live))).toFixed(3) : "0",
			})

			// Node 4 (Publishing) leaves the track and lands as the check disc; the
			// other nodes chase it and merge into it, so the graph gathers into one point.
			const disc = rectTrack(t, discStates)
			const discX = (disc.l + disc.r) / 2
			const discY = (disc.t + disc.b) / 2

			nodes.forEach((node) => {
				const { i } = node
				const stageInfo = STAGES[i]
				const appear = presence(t, T.timeline - 0.1 + i * 0.05, null, { spring: S.pop, scale: 0.5, y: 0, blur: 0, dur: 0.3 })
				const liveIn = springAt(t, stageInfo.live, S.fade)
				const doneIn = springAt(t, stageInfo.done, S.fade)
				css(node.pending, { opacity: clamp(1 - liveIn).toFixed(3) })
				css(node.live, {
					opacity: clamp(liveIn - doneIn).toFixed(3),
					transform: `scale(${(0.75 + 0.25 * springAt(t, stageInfo.live, S.pop)).toFixed(4)})`,
				})
				css(node.core, { opacity: (0.35 + 0.65 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (t - stageInfo.live)) / 1.2))).toFixed(3) })
				const doneScale = 0.4 + 0.6 * springAt(t, stageInfo.done, S.pop)
				css(node.done, { opacity: clamp(doneIn).toFixed(3), transform: `scale(${doneScale.toFixed(4)})` })
				css(node.check, { strokeDashoffset: (1 - ease.cubicOut(progress(t, stageInfo.done + 0.05, stageInfo.done + 0.28))).toFixed(4) })

				const labelState = mixColor(mixColor(C.text3, C.text, liveIn), C.text2, doneIn)
				css(node.label, {
					left: `${(L.nodes[i] - node.labelW / 2).toFixed(3)}px`,
					color: labelState,
					...fxStyle(presence(t, T.timeline + i * 0.05, T.morph + i * 0.015, { y: 4, blur: 2 }, { dur: 0.12 })),
				})

				if (i < 3) {
					const x = lerp(L.nodes[i], discX, converge)
					const y = lerp(L.nodeY, discY, converge)
					css(node.el, {
						left: `${(x - 9).toFixed(3)}px`, top: `${(y - 9).toFixed(3)}px`,
						...fxStyle({ ...appear, o: appear.o * (1 - progress(converge, 0.5, 0.95)), s: appear.s * (1 - 0.35 * converge) }),
					})
				}
			})

			const discOut = exit(t, T.open2 + 0.02, { dur: 0.14, scale: 0.85, y: 0 })
			const node3 = nodes[3]
			const appear = presence(t, T.timeline - 0.1 + 3 * 0.05, null, { spring: S.pop, scale: 0.5, y: 0, blur: 0, dur: 0.3 })
			place(node3.el, disc, undefined, fxStyle(combine(appear, discOut)))
			const green = springAt(t, T.morph + 0.14, S.fade)
			css(node3.done, { background: mixColor(C.ink, C.liveC, green) })
			css(node3.done.firstElementChild, { opacity: (1 - progress(t, T.morph + 0.06, T.morph + 0.16)).toFixed(3) })
			css(discCheck, { opacity: t > T.landed - 0.06 ? "1" : "0" })
			css(discPath, { strokeDashoffset: (1 - ease.cubicOut(progress(t, T.landed - 0.06, T.landed + 0.26))).toFixed(4) })

			const hoverOn = pulseTrack(t, T.hover + 0.02, T.unhover, S.ui)
			const hs = 18 + 10 * clamp(hoverOn)
			css(halo, {
				left: `${(L.nodes[1] - hs / 2).toFixed(3)}px`, top: `${(L.nodeY - hs / 2).toFixed(3)}px`,
				width: `${hs.toFixed(3)}px`, height: `${hs.toFixed(3)}px`, opacity: clamp(hoverOn).toFixed(3),
			})
		}

		/* Log: one line per event, folding away top-down when the build lands */
		LOG.forEach((line, i) => {
			css(logLines[i], fxStyle(presence(t, line.at, T.morph + i * 0.01, { y: 6, blur: 2.5, dur: 0.26 }, { y: -5, dur: 0.15, blur: 3 })))
		})

		/* Tooltip on the Installing node */
		{
			const fx = presence(t, T.hover + 0.06, T.unhover, { spring: S.pop, y: 6, scale: 0.92, blur: 2, dur: 0.3 }, { dur: 0.12, y: 3, scale: 0.96 })
			css(tooltip, {
				left: `${(L.nodes[1] - tooltipBox.w / 2).toFixed(3)}px`,
				top: `${(L.nodeY - 20 - tooltipBox.h).toFixed(3)}px`,
				...fxStyle(fx),
			})
		}

		/* ── Endpoint: chip → URL → address bar → first row → first line ─── */

		if (t < DETACH) {
			place(endpoint, parts.lines[0], undefined, { ...fxStyle(lockupFx), zIndex: "20" })
			markLook(endpoint, endpointRing)
			css(endpointDot, { opacity: "0" })
			css(endpointText, { opacity: "0" })
			css(underline, { opacity: "0" })
		} else {
			const box = rectTrack(t, endpointStates)
			const fx = presence(t, T.timeline + 0.06, null, { spring: S.pop, scale: 0.9, y: 0, x: -6, blur: 2, dur: 0.3 })
			const look = lineLook(t, 0, box.b - box.t)
			const ring = 1 - springAt(t, T.collapse + 0.06, S.fade)
			const outroZ = t > T.collapse + 0.05 || t < T.timeline
			place(endpoint, box, undefined, { background: look, zIndex: outroZ ? "20" : "5", ...fxStyle(fx) })
			css(endpointRing, { opacity: clamp(ring).toFixed(3) })

			const kUrl = springAt(t, T.morph + 0.1, S.morph)
			const kAddr = springAt(t, T.open2 + 0.06, S.morph)
			const dotX = 12 + 8 * kUrl - 6 * kAddr
			const dotSize = 7 + 2 * kUrl - 2 * kAddr
			const textX = 27 + 14 * kUrl - 11 * kAddr
			const textScale = 1 + (19 / 13 - 1) * kUrl + (14 / 13 - 19 / 13) * kAddr
			const hgt = box.b - box.t
			const contentFx = exit(t, T.fold + 0.1, { dur: 0.12, y: 0 })
			let dotColor = mixColor(C.buildC, C.liveC, springAt(t, T.live + 0.04, S.fade))
			const dotPop = 1 + 0.5 * bump(progress(t, T.live + 0.04, T.live + 0.34))
			css(endpointDot, {
				left: `${(dotX - (dotSize * (dotPop - 1)) / 2).toFixed(3)}px`, top: `${((hgt - dotSize * dotPop) / 2).toFixed(3)}px`,
				width: `${(dotSize * dotPop).toFixed(3)}px`, height: `${(dotSize * dotPop).toFixed(3)}px`,
				background: dotColor, ...fxStyle(contentFx),
			})
			let textColor = mixColor(C.text3, C.text2, springAt(t, T.live + 0.04, S.fade))
			textColor = mixColor(textColor, C.accentInk, springAt(t, T.morph + 0.14, S.fade))
			textColor = mixColor(textColor, C.text, springAt(t, T.open2 + 0.1, S.fade))
			css(endpointText, {
				left: `${textX.toFixed(3)}px`, top: `${(hgt / 2 - 6.5).toFixed(3)}px`, color: textColor,
				...fxStyle(contentFx, `scale(${textScale.toFixed(4)})`),
			})
			const line = ease.cubicOut(progress(t, T.urlHover + 0.04, T.urlHover + 0.28)) * (1 - progress(t, T.open2 + 0.04, T.open2 + 0.18))
			css(underline, {
				left: `${textX.toFixed(3)}px`, top: `${(hgt / 2 + 6.5 * textScale + 3).toFixed(3)}px`,
				width: `${(endpointTextW * textScale).toFixed(3)}px`,
				opacity: line > 0.001 ? "0.9" : "0", transform: `scaleX(${line.toFixed(4)})`,
			})
		}

		/* ── Success card ─────────────────────────────────────────────────── */

		css(title, fxStyle(presence(t, T.morph + 0.26, T.open2 + 0.02, { y: 10, blur: 4, dur: 0.34 }, { dur: 0.12 })))
		css(liveSub, fxStyle(presence(t, T.morph + 0.34, T.open2 + 0.03, { y: 8 }, { dur: 0.12 })))
		css(meta, fxStyle(presence(t, T.morph + 0.62, T.open2 + 0.04, { y: 6 }, { dur: 0.12 })))

		{
			const copyBox = rectTrack(t, copyStates)
			const openBox = rectTrack(t, openStates)
			const copyFx = presence(t, T.morph + 0.48, T.fold + 0.02, { spring: S.pop, scale: 0.85, y: 0, dur: 0.3 }, { dur: 0.12 })
			const openFx = presence(t, T.morph + 0.54, T.fold + 0.05, { spring: S.pop, scale: 0.85, y: 0, dur: 0.3 }, { dur: 0.12 })
			const hover = pulseTrack(t, T.copy - 0.12, T.fold, S.fade)
			const press = t > T.copy - 0.1 && t < T.copy + 0.3 ? cursor.at(t).press : 0
			place(copyBtn.el, copyBox, undefined, {
				background: mixColor(C.surface2, C.surface3, clamp(hover)),
				...fxStyle(copyFx, `scale(${(1 - 0.06 * press).toFixed(4)})`),
			})
			place(openBtn.el, openBox, undefined, fxStyle(openFx))
			const cw = copyBox.r - copyBox.l
			iconInBtn(copyBtn, cw)
			css(copyCheck, { left: `${(cw - 17) / 2}px`, top: `${(cw - 17) / 2}px` })
			iconInBtn(openBtn, openBox.r - openBox.l)
			const [toCheck, check] = [exit(t, T.copy + 0.02, { dur: 0.1, scale: 0.6, y: 0 }), enter(t, T.copy + 0.08, { spring: S.pop, scale: 0.5, y: 0, blur: 2 })]
			css(copyBtn.icon, fxStyle(toCheck))
			css(copyCheck, fxStyle(check))
			css(reloadBtn.el, fxStyle(presence(t, T.open2 + 0.24, T.fold + 0.04, { spring: S.pop, scale: 0.85, y: 0 }, { dur: 0.12 })))
		}

		/* ── Preview ──────────────────────────────────────────────────────── */

		css(tabs, fxStyle(presence(t, T.open2 + 0.14, T.fold, { x: -12, y: 0, blur: 3 }, { dur: 0.12 })))
		css(body, fxStyle(presence(t, T.open2 + 0.1, T.fold + 0.01, { y: 0, blur: 0, scale: 1, dur: 0.22 }, { dur: 0.2, y: -6, scale: 0.97, blur: 2 })))
		if (t > T.open2 && t < T.fold + 0.4) site.update(t, T.render - 0.1)
		css(copied, {
			left: `${(L.copied.cx - copiedW / 2).toFixed(3)}px`, top: `${L.copied.bottom - 30}px`,
			...fxStyle(presence(t, T.copy + 0.08, T.fold, { spring: S.pop, y: 6, scale: 0.92, blur: 2, dur: 0.3 }, { dur: 0.12, y: 3 })),
		})

		/* ── Your builds ──────────────────────────────────────────────────── */

		css(listTitle, fxStyle(presence(t, T.fold + 0.16, T.collapse, { y: 6 }, { dur: 0.12 })))
		rowContent.forEach((row, i) => {
			const fx = presence(t, T.fold + 0.2 + i * 0.07, T.collapse + i * 0.02, { y: 8, blur: 3, dur: 0.3 }, { dur: 0.1, scale: 0.97 })
			css(row.icon, { zIndex: "7", ...fxStyle(fx) })
			css(row.title, { zIndex: "7", ...fxStyle(fx) })
			css(row.meta, { zIndex: "7", ...fxStyle(fx) })
		})

		/* Rows 2 and 3: lines of the mark at the start and the end of the loop */
		rowBoxes.forEach((row, j) => {
			const i = j + 1
			if (t < DETACH) {
				place(row.el, parts.lines[i], undefined, { ...fxStyle(lockupFx), zIndex: "20" })
				markLook(row.el, row.ring)
				return
			}
			const box = rectTrack(t, [
				{ rect: L.rows[i] },
				{ at: T.collapse + 0.02, rect: L.final.lines[i], edges: thinning(i) },
			])
			const fx = presence(t, T.fold + 0.2 + i * 0.07, null, { y: 10, blur: 0, dur: 0.32 })
			place(row.el, box, undefined, { background: lineLook(t, i, box.b - box.t), zIndex: t > T.collapse + 0.05 ? "20" : "5", ...fxStyle(fx) })
			css(row.ring, { opacity: clamp(1 - springAt(t, T.collapse + 0.06, S.fade)).toFixed(3) })
		})

		/* Dots: the mark's endpoint; the three Live dots; the endpoint again */
		dots.forEach((dot, i) => {
			let cx, cy, r, color, o
			if (t < DETACH) {
				cx = parts.dot.cx
				cy = parts.dot.cy
				r = parts.dot.r
				color = C.accent
				o = i === 1 ? lockupFx.o : 0
			} else {
				// The three Live dots converge on the endpoint and become one violet dot.
				const at = T.collapse + 0.04 + Math.abs(i - 1) * 0.02
				const rise = enter(t, T.fold + 0.2 + i * 0.07, { y: 8, dur: 0.3 })
				cx = track(t, L.rowDots[i].cx, [{ at, to: L.final.dot.cx, spring: S.dotIn }])
				cy = track(t, L.rowDots[i].cy + rise.y, [{ at, to: L.final.dot.cy, spring: S.dotIn }])
				r = track(t, 3, [{ at, to: L.final.dot.r, spring: S.dotIn }])
				color = mixColor(C.liveC, C.accent, springAt(t, T.collapse + 0.1, S.fade))
				o = i === 1 ? rise.o : rise.o * (1 - progress(t, T.collapse + 0.12, T.collapse + 0.3))
			}
			css(dot, {
				left: `${(cx - r).toFixed(3)}px`, top: `${(cy - r).toFixed(3)}px`,
				width: `${(2 * r).toFixed(3)}px`, height: `${(2 * r).toFixed(3)}px`,
				background: color, opacity: o <= 0.001 ? "0" : o >= 0.999 ? "1" : o.toFixed(3), zIndex: "21",
			})
		})
		css(ping, { zIndex: "22" })
		css(tile, { zIndex: "19" })
		css(wordmark, { zIndex: "19" })
		css(nodes[3].el, { zIndex: "8" })

		/* ── Cursor (screen space) ────────────────────────────────────────── */

		const c = cursor.at(t)
		const [sx, sy] = worldToScreen(cam, c.x, c.y, view)
		css(cursorEl, {
			transform: `translate(${(sx - 3).toFixed(2)}px, ${(sy - 2).toFixed(2)}px) scale(${(1 - 0.12 * c.press).toFixed(4)})`,
			opacity: c.opacity.toFixed(3),
		})
		css(clickRing, {
			left: `${(sx - c.ring.r).toFixed(2)}px`, top: `${(sy - c.ring.r).toFixed(2)}px`,
			width: `${(2 * c.ring.r).toFixed(2)}px`, height: `${(2 * c.ring.r).toFixed(2)}px`,
			opacity: (c.ring.o * c.opacity).toFixed(3),
		})

		last = { t, cam, shell: sh, cursor: { world: [c.x, c.y], screen: [sx, sy] }, scene: sceneAt(t) }
		return last
	}

	return { seek, layout: L, info: () => last }
}

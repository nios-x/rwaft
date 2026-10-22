import { css, h, text } from "../engine/dom.js"
import { clamp, ease, lerp, mixColor, progress, seeded, stops } from "../engine/math.js"
import { spring, springAt, springs, track } from "../engine/spring.js"
import { combine, enter, exit, fxStyle, presence } from "../engine/transitions.js"
import { cursorPath } from "../engine/cursor.js"
import { elapsed } from "../engine/count.js"
import { B, CAPTIONS, DURATION, T, grid, sceneAt } from "./beatmap.js"
import { CHANGE, ELAPSED, LOG, STAGES } from "./content.js"
import { buildWindow, measure } from "./ui.js"

/**
 * The product overview. createScene() builds the window, captions and end
 * card once; seek(t) derives every moving value from t alone.
 *
 * The browser window is world space. The camera fits a chosen rectangle of
 * it into the area above the caption line, springing between framings, so
 * zooms into the prompt, the log or the address bar are camera moves over
 * one continuous UI rather than separate shots.
 */

export const VIEW = { width: 1920, height: 1080 }

/**
 * The product card: fixed on screen above the caption line, the same aspect
 * as the browser window. The camera moves the window inside it and the card
 * clips, so zoomed shots stay neat rectangles like the rest.
 */
const CARD = { x: 160, y: 36, w: 1600, h: 880 }
const WIN = { w: 1600, h: 880 }
/** The real deployment, captured at a 1000 px wide viewport (assets/demo-site-top.png, 2× pixels, cropped to the works section). */
const SITE_VIEWPORT = 1000
const WORKS_TOP = 1141

const S = {
	...springs,
	cam: spring(0.85, 0.96),
	win: spring(0.7, 0.9),
	scroll: spring(0.45, 1),
}

/** Captions live outside the app, on the white page. */
const C = { text: "#0a0a0b", accentInk: "#4a25d6" }

/** The app inside the window: rwaft's dark-theme tokens (globals.css). */
const D = {
	text: "#fafafa", text2: "#a8a8b2", text3: "#8b8b95", onInk: "#0a0a0b",
	surface2: "#1b1b1f", surface3: "#26262b", line: "#24242a", lineStrong: "#34343b",
	buildC: "#f97316", liveC: "#22c55e",
}

const px = (n) => `${+n.toFixed(3)}px`
const opacityOf = (o) => (o <= 0.001 ? "0" : o >= 0.999 ? "1" : o.toFixed(3))

/** Visible during any of the [from, to) windows, cross-fading at each edge. */
function windows(t, list, inOpts = {}, outOpts = {}) {
	let best = { o: 0, x: 0, y: 0, s: 1, blur: 0 }
	for (const [from, to] of list) {
		const fx = presence(t, from, to, { dur: 0.3, y: 0, scale: 0.996, blur: 3, ...inOpts }, { dur: 0.22, y: 0, scale: 1, blur: 2, ...outOpts })
		if (fx.o > best.o) best = fx
	}
	return best
}

/** Cross-fades a set of stacked labels so only `index` shows, each switch fading over ~0.2 s. */
function labels(t, els, switches) {
	els.forEach((el, i) => {
		let o = switches[0][1] === i ? 1 : 0
		for (const [at, idx] of switches.slice(1)) {
			const u = ease.cubicInOut(progress(t, at, at + 0.2))
			o = lerp(o, idx === i ? 1 : 0, u)
		}
		css(el, { opacity: opacityOf(o), visibility: o <= 0.001 ? "hidden" : "visible" })
	})
}

/** A press dip on an element around a click time. */
const pressAt = (t, at) => {
	if (t < at - 0.06 || t > at + 0.24) return 0
	return ease.cubicOut(progress(t, at - 0.06, at)) * (1 - ease.cubicInOut(progress(t, at + 0.04, at + 0.24)))
}

export function createScene(stage) {
	css(stage, { width: px(VIEW.width), height: px(VIEW.height) })
	stage.classList.add("ov")

	const card = h("div", "ov-card", stage)
	css(card, { left: px(CARD.x), top: px(CARD.y), width: px(CARD.w), height: px(CARD.h) })
	const world = h("div", "ov-world", card)
	const ui = buildWindow(world)
	const capLayer = h("div", "ov-abs", stage)
	css(capLayer, { left: "0", top: "0", width: px(VIEW.width), height: px(VIEW.height) })
	const end = h("div", "end", stage)
	const cursorLayer = h("div", "ov-cursor-layer", stage)

	const G = measure(ui)
	const { home, work, pricing } = ui

	/* The example site, laid out for the preview body and scaled up a touch so it reads on video. */
	// The preview shows the real site, sojjxnmx.rwaft.live, from a full-page capture.
	// A canvas the size of the preview body shows the visible slice of the capture. A layer
	// thousands of pixels tall with opacity or blur becomes an offscreen surface Chrome drops.
	const source = window.__bitmaps["assets/demo-site-top.png"]
	const ratio = source.naturalWidth / SITE_VIEWPORT
	const bodyW = G.panelBody.w - 2
	const bodyH = G.panelBody.h - 2
	const shot = (frame) => {
		const canvas = h("canvas", null, frame)
		canvas.width = source.naturalWidth
		canvas.height = Math.round(source.naturalWidth * (bodyH / bodyW))
		css(canvas, { position: "absolute", left: "0", top: "0", width: px(bodyW), height: px(bodyH), display: "block" })
		const ctx = canvas.getContext("2d")
		let drawn = null
		return {
			canvas,
			/** Shows the page scrolled to `y` (in the site's own CSS px). */
			scrollTo(y) {
				const sy = Math.round(Math.min(y * ratio, source.naturalHeight - canvas.height))
				if (sy === drawn) return
				drawn = sy
				ctx.drawImage(source, 0, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
			},
		}
	}
	work.shotFirst = shot(work.frameLight)
	work.shotSecond = shot(work.frameDark)
	work.shotFirst.scrollTo(0)

	/* The prompt, typed one character at a time. */
	home.valPrompt.innerHTML = [...home.valPrompt.textContent].map((ch) => `<span>${ch === " " ? "&nbsp;" : ch}</span>`).join("")
	const promptChars = [...home.valPrompt.children]
	const promptRight = promptChars.map((el) => el.offsetLeft + el.offsetWidth)
	const promptRandom = seeded(4)
	const promptTimes = promptChars.map((_, i) => T.chip + 0.06 + i * 0.016 + promptRandom() * 0.01)

	/* The typed change, one span per character so the caret sits on real glyph edges. */
	work.chatVal.innerHTML = [...CHANGE].map((ch) => `<span>${ch === " " ? "&nbsp;" : ch}</span>`).join("")
	const chatChars = [...work.chatVal.children]
	const chatCharRight = chatChars.map((el) => el.offsetLeft + el.offsetWidth)
	const typeRandom = seeded(9)
	const typeTimes = chatChars.map((_, i) => T.chatFocus + 0.12 + i * 0.024 + typeRandom() * 0.012)

	/* ── Captions ───────────────────────────────────────────────────────── */

	const captions = CAPTIONS.map((c) => {
		const el = h("div", `cap ${c.center ? "cap--center" : "cap--bottom"}`, capLayer)
		css(el, { top: px(c.center ? 511 : 958) })
		const words = c.text.split(" ")
		const keyWords = c.key.split(" ")
		const keyStart = words.findIndex((_, i) => keyWords.every((k, j) => words[i + j]?.replace(/[.,]$/, "") === k.replace(/[.,]$/, "")))
		const spans = []
		let hl = null
		let hlBg = null
		words.forEach((word, i) => {
			const inKey = i >= keyStart && i < keyStart + keyWords.length
			if (inKey && i === keyStart) {
				hl = h("span", "hl", el)
				hlBg = h("i", "hl-bg", hl)
				css(hlBg, { position: "absolute" })
			}
			const host = inKey ? hl : el
			// Trailing punctuation sits outside the highlight.
			const bare = inKey && /[.,]$/.test(word) && i === keyStart + keyWords.length - 1
			const span = h("span", "w", host, bare ? word.slice(0, -1) : word)
			spans.push({ span, i, inKey })
			if (bare) spans.push({ span: h("span", "w", el, word.slice(-1)), i, inKey: false })
			if (i < words.length - 1) (inKey && i < keyStart + keyWords.length - 1 ? hl : el).append(" ")
		})
		let sub = null
		if (c.sub) {
			sub = h("div", "cap-sub", capLayer, c.sub)
			css(sub, { top: px(1012) })
		}
		return { c, el, spans, hl, hlBg, keyStart, sub }
	})

	/* ── End card ───────────────────────────────────────────────────────── */

	const endMark = h("div", "end-mark", end)
	const f = 104 / 28
	const endLines = [[9.6, 6.4], [14, 8.9], [18.4, 5.4]].map(([y, len]) => {
		const line = h("i", null, endMark)
		css(line, { left: px((6.6 - 1.05) * f), top: px((y - 1.05) * f), width: px((len + 2.1) * f), height: px(2.1 * f) })
		return line
	})
	const endDot = h("b", null, endMark)
	css(endDot, { left: px((19.7 - 2.6) * f), top: px((14 - 2.6) * f), width: px(5.2 * f), height: px(5.2 * f) })
	const URL_TEXT = "rwaft.live"
	const endUrl = h("div", "end-url", end)
	endUrl.innerHTML = [...URL_TEXT].map((ch) => `<span>${ch}</span>`).join("")
	const urlChars = [...endUrl.querySelectorAll("span")]
	const urlCaret = h("i", null, end)
	css(urlCaret, { position: "absolute", top: px(558), width: "3px", height: "30px", background: "#5b34f0" })
	const urlRight = urlChars.map((el) => el.getBoundingClientRect().right - stage.getBoundingClientRect().left)
	const urlLeft = urlChars[0].getBoundingClientRect().left - stage.getBoundingClientRect().left
	const endTag = h("div", "end-tag", end, "AI website builder")

	/* ── Cursor ─────────────────────────────────────────────────────────── */

	const cursorEl = h("div", "ov-cursor", cursorLayer, `<svg viewBox="0 0 24 24"><path d="M5.2 2.6 5.3 19.4c0 .7.8 1 1.3.5l3.9-3.9 2.6 5.8c.2.5.8.7 1.3.5l2-.9c.5-.2.7-.8.5-1.3l-2.6-5.7 5.4-.4c.7-.1 1-.9.5-1.4L6.6 1.9c-.5-.5-1.4-.1-1.4.7Z" fill="#fff" stroke="#0a0a0b" stroke-width="1.3" stroke-linejoin="round"/></svg>`)
	const ring = h("div", "ov-ring", cursorLayer)

	const P = G.panelBody
	const cursor = cursorPath({
		home: [1360, 980],
		moves: [
			{ at: T.home + 0.42, dur: 0.52, to: G.homeTa, arc: 0.12 },
			{ at: T.chip + 0.56, dur: 0.38, to: G.homeSend, arc: -0.14 },
			{ at: T.logTab - 0.58, dur: 0.52, to: G.tabLog, arc: 0.14 },
			{ at: T.logTab + 0.3, dur: 0.6, to: [G.panel.x + G.panel.w - 110, G.panel.y + G.panel.h - 150], arc: -0.1 },
			{ at: T.previewTab - 0.58, dur: 0.52, to: G.tabPreview, arc: 0.12 },
			{ at: T.previewTab + 0.25, dur: 0.6, to: [P.x + P.w * 0.64, P.y + P.h * 0.6], arc: -0.1 },
			{ at: T.copy - 0.48, dur: 0.42, to: G.copy, arc: 0.14 },
			{ at: T.chatFocus - 0.5, dur: 0.45, to: G.chatTa, arc: -0.12 },
			{ at: T.changeSend - 0.48, dur: 0.4, to: G.chatSend, arc: 0.12 },
			{ at: T.changeSend + 0.2, dur: 0.6, to: [P.x + P.w * 0.7, P.y + P.h * 0.55], arc: -0.12 },
			{ at: T.repo + 0.02, dur: 0.42, to: G.modeRepo, arc: 0.12 },
			{ at: T.repoMode + 0.08, dur: 0.3, to: G.homeTa, arc: 0.1, overshoot: 0.006 },
			{ at: T.paste + 0.05, dur: 0.38, to: G.homeSend, arc: -0.12 },
			{ at: T.pricing + 0.2, dur: 0.6, to: G.freeCard, arc: 0.12 },
			{ at: T.site + 0.1, dur: 0.8, to: [1360, 980], arc: -0.1, overshoot: 0 },
		],
		clicks: [T.chip, T.send, T.logTab, T.previewTab, T.copy, T.chatFocus, T.changeSend, T.repoMode, T.paste - 0.08, T.repoSend],
		shows: [{ at: T.home + 0.38, dur: 0.2, to: 1, from: 0 }, { at: T.site + 0.25, dur: 0.3, to: 0 }],
	})

	/* ── Camera ─────────────────────────────────────────────────────────── */

	const fit = (r, cap = 2.05) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, s: Math.max(CARD.w / WIN.w, Math.min(cap, CARD.w / r.w, CARD.h / r.h)) })
	// Panel shots start exactly at the panel edge so no sliver of the chat shows.
	const Pn = G.panel
	const logView = { x: Pn.x, y: Pn.y, w: 940, h: 517 }
	const siteView = { x: Pn.x, y: Pn.y, w: Pn.w, h: Pn.w * (CARD.h / CARD.w) }
	const pricingView = { x: 260, y: 120, w: 1080, h: 594 }
	const shots = [
		[T.home + 0.3, G.hero],
		[T.build + 0.02, G.full],
		[T.logTab + 0.05, logView],
		[T.repair + 0.05, G.chatLower],
		[T.previewTab + 0.05, G.full],
		[B(26, 0.4), siteView],
		[T.change, G.chatBottom],
		[T.changeSend + 0.22, G.full],
		[T.repo + 0.05, G.hero],
		[T.pricing + 0.05, pricingView],
		[T.site, G.full],
	].map(([at, r]) => ({ at, ...fit(r) }))
	const first = fit(G.full)
	// Never show past the window: the centre is clamped to keep the view inside it.
	const clampView = (cx, cy, s) => {
		const hw = CARD.w / 2 / s
		const hh = CARD.h / 2 / s
		return [clamp(cx, hw, WIN.w - hw), clamp(cy, hh, WIN.h - hh)]
	}
	const camera = (t) => {
		const keys = (k) => shots.map((s) => ({ at: s.at, to: k(s), spring: S.cam }))
		const s = Math.exp(track(t, Math.log(first.s), keys((s) => Math.log(s.s))))
		const [cx, cy] = clampView(track(t, first.cx, keys((s) => clampView(s.cx, s.cy, s.s)[0])), track(t, first.cy, keys((s) => clampView(s.cx, s.cy, s.s)[1])), s)
		return { cx, cy, s }
	}
	const toScreen = (cam, x, y) => [CARD.x + CARD.w / 2 + (x - cam.cx) * cam.s, CARD.y + CARD.h / 2 + (y - cam.cy) * cam.s]

	/* ── Precomputed scroll targets ─────────────────────────────────────── */

	const msgBottom = G.msgs.map((m) => m.top + m.height)
	const threadKeys = work.messages.map((m, i) => ({ at: m.at, to: Math.max(0, msgBottom[i] + 44 - G.threadH), spring: S.scroll }))
	const logKeys = LOG.map((l, i) => ({ at: l.at, to: Math.max(0, G.logLines[i].top + G.logLines[i].height - G.logH), spring: S.scroll }))

	const stageTimes = (build) => STAGES.map((s, i) => {
		if (build === 0) return { live: s.live, done: STAGES[i + 1]?.live ?? Infinity }
		const base = T.changeSend + 0.05
		const second = [base, base, base, base, base + 0.05, base + 0.25, base + 0.37, T.changeLive]
		return { live: second[i], done: second[i + 1] ?? Infinity }
	})
	const firstStages = stageTimes(0)
	const secondStages = stageTimes(1)

	/* ── seek ───────────────────────────────────────────────────────────── */

	let last = null

	function seek(input) {
		const t = grid.wrap(input)
		const cam = camera(t)
		css(world, { transform: `translate(${px(CARD.w / 2)}, ${px(CARD.h / 2)}) scale(${cam.s.toFixed(5)}) translate(${px(-cam.cx)}, ${px(-cam.cy)})` })

		/* Window */
		// Opacity ramps fast so the dark card never sits half-transparent (grey) on the white page;
		// rise, scale and blur carry the motion.
		const winOutAt = B(50, 0.7)
		const winIn = { ...enter(t, T.window, { spring: S.win, y: 60, scale: 0.93, blur: 10, dur: 0.6 }), o: ease.cubicOut(progress(t, T.window, T.window + 0.16)) }
		const winOut = { ...exit(t, winOutAt, { dur: 0.32, scale: 0.965, blur: 8, y: 0 }), o: 1 - ease.cubicIn(progress(t, winOutAt + 0.14, winOutAt + 0.22)) }
		const winFx = combine(winIn, winOut)
		css(card, fxStyle(winFx))
		labels(t, ui.urls, [[0, 0], [T.pricing, 1], [T.site, 0]])

		/* Screens */
		css(home.scr, fxStyle(windows(t, [[null, T.build], [T.repo, T.pricing], [T.site, null]])))
		css(work.scr, fxStyle(windows(t, [[T.build, T.repo]])))
		css(pricing.scr, fxStyle(windows(t, [[T.pricing, T.site]])))

		/* ── Home ────────────────────────────────────────────────────────── */
		{
			const inRepo = t >= T.repo && t < T.site
			const repoK = inRepo ? springAt(t, T.repoMode, S.ui) : 0
			const a = G.modePrompt
			const b = G.modeRepoBox
			css(home.thumb, { left: px(lerp(a.left, b.left, repoK)), width: px(lerp(a.width, b.width, repoK)) })
			css(home.modePrompt, { color: mixColor(D.text, D.text2, repoK) })
			css(home.modeRepo, { color: mixColor(D.text2, D.text, repoK) })

			const typedPrompt = t < T.build ? promptChars.reduce((n, _, i) => (t >= promptTimes[i] ? i + 1 : n), 0) : 0
			promptChars.forEach((el, i) => css(el, { visibility: i < typedPrompt ? "visible" : "hidden" }))
			const hasPrompt = typedPrompt > 0
			const hasRepo = t >= T.paste && t < T.pricing
			const promptIn = { o: 1, x: 0, y: 0, s: 1, blur: 0 }
			const repoIn = enter(t, T.paste, { y: 0, x: -4, blur: 3, dur: 0.22 })
			css(home.valPrompt, fxStyle(hasPrompt ? promptIn : { o: 0, x: 0, y: 0, s: 1, blur: 0 }))
			css(home.valRepo, fxStyle(hasRepo ? repoIn : { o: 0, x: 0, y: 0, s: 1, blur: 0 }))
			const phPromptO = hasPrompt || inRepo ? 0 : 1
			const phRepoO = inRepo && !hasRepo ? repoK : 0
			css(home.phPrompt, { opacity: opacityOf(hasPrompt ? 0 : inRepo ? 1 - repoK : phPromptO) })
			css(home.phRepo, { opacity: opacityOf(hasRepo ? 1 - repoIn.o : phRepoO) })

			const focusOn = (t >= T.chip && t < T.build) || (t >= T.paste - 0.08 && t < T.pricing)
			const focusAt = t < T.repo ? T.chip : T.paste - 0.08
			css(home.focus, { opacity: opacityOf(focusOn ? ease.cubicOut(progress(t, focusAt, focusAt + 0.18)) : 0) })
			const caretX = G.promptTextLeft + (hasPrompt ? promptRight[typedPrompt - 1] : hasRepo ? G.valRepoW : 0) + 1
			const lastEdit = hasRepo ? T.paste : (promptTimes[typedPrompt - 1] ?? T.chip)
			const blink = t - lastEdit < 0.5 || Math.floor((t - lastEdit - 0.5) / 0.5) % 2 === 1
			css(home.caret, { left: px(caretX), opacity: focusOn && blink ? "1" : "0" })

			labels(t, home.costs, [[0, 0], [T.repo, 2], [T.site, 3]])
			labels(t, home.credits, [[0, 0], [T.repo, 2], [T.site, 3]])

			css(home.send, { transform: `scale(${(1 - 0.1 * Math.max(pressAt(t, T.send), pressAt(t, T.repoSend))).toFixed(4)})` })

			const scrolled = t >= T.site ? 230 * ease.cubicInOut(progress(t, T.scroll, T.scroll + 1.3)) : 0
			css(home.scroll, { transform: `translateY(${px(-scrolled)})` })
		}

		/* ── Workspace ───────────────────────────────────────────────────── */
		{
			const building = (t >= T.build && t < T.live) || (t >= T.changeSend && t < T.changeLive)
			labels(t, [work.statusBuilding, work.statusLive], [[0, 0], [T.live, 1], [T.changeSend, 0], [T.changeLive, 1]])
			labels(t, work.credits, [[0, 1], [T.changeSend, 2]])
			css(work.addressDot, { background: building ? D.buildC : D.liveC })
			labels(t, work.addressTexts, [[0, 0], [T.changeSend, 1]])

			// Chat thread: messages arrive, the thread follows the newest one.
			work.messages.forEach((m, i) => css(work.msgEls[i], fxStyle(enter(t, m.at, { y: 10, blur: 3, dur: 0.34 }))))
			css(work.threadIn, { transform: `translateY(${px(-track(t, 0, threadKeys))})` })
			const lastShown = work.messages.reduce((n, m, i) => (t >= m.at ? i : n), 0)
			const working = (t >= T.send + 0.5 && t < T.live) || (t >= T.changeSend + 0.15 && t < T.changeLive)
			css(work.typing, { top: px(msgBottom[lastShown] + 16), opacity: opacityOf(working ? 1 : 0) })
			work.typingDots.forEach((dot, i) => css(dot, { opacity: (0.35 + 0.65 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (t - i * 0.15) / 1.2))).toFixed(3) }))

			// The chat box: a change gets typed and sent.
			const editing = t >= T.live
			labels(t, [work.chatPhDescribe, work.chatPhChange], [[0, 0], [T.live, 1]])
			const typed = chatChars.reduce((n, _, i) => (t >= typeTimes[i] && t < T.changeSend ? i + 1 : n), 0)
			chatChars.forEach((el, i) => css(el, { visibility: i < typed ? "visible" : "hidden" }))
			css(work.chatPhChange, { visibility: typed > 0 || !editing ? "hidden" : "visible" })
			const chatFocused = t >= T.chatFocus && t < T.changeSend + 0.05
			css(work.chatFocus, { opacity: opacityOf(chatFocused ? ease.cubicOut(progress(t, T.chatFocus, T.chatFocus + 0.18)) : 0) })
			const chatBlink = t - (typeTimes[typed - 1] ?? T.chatFocus) < 0.5 || Math.floor((t - T.chatFocus) / 0.5) % 2 === 0
			css(work.chatCaret, { left: px(G.chatVal.left + (typed ? chatCharRight[typed - 1] : 0) + 1), opacity: chatFocused && chatBlink ? "1" : "0" })
			css(work.chatThumb, { left: px(G.chatModePrompt.left), width: px(G.chatModePrompt.width) })
			labels(t, work.chatCosts, [[0, 1], [T.changeSend, 2]])
			css(work.chatSend, { opacity: typed > 0 || (t >= T.changeSend && t < T.changeSend + 0.1) ? "1" : "0.25", transform: `scale(${(1 - 0.1 * pressAt(t, T.changeSend)).toFixed(4)})` })

			// Tabs: Preview ↔ Log.
			const onLog = springAt(t, T.logTab, S.ui) - springAt(t, T.previewTab, S.ui)
			const pv = G.tabPreviewBox
			const lg = G.tabLogBox
			css(work.tabThumb, { left: px(lerp(pv.left, lg.left, onLog)), width: px(lerp(pv.width, lg.width, onLog)), transform: `scale(${(1 - 0.04 * Math.max(pressAt(t, T.logTab), pressAt(t, T.previewTab))).toFixed(4)})` })
			css(work.tabPreview, { color: mixColor(D.onInk, D.text2, clamp(onLog)) })
			css(work.tabLog, { color: mixColor(D.text2, D.onInk, clamp(onLog)) })
			const shownLines = LOG.filter((l) => t >= l.at).length
			text(work.tabCount, String(shownLines))
			css(work.tabCount, { background: mixColor(D.surface3, "rgba(10,10,11,0.18)", clamp(onLog)), color: mixColor(D.text2, D.onInk, clamp(onLog)) })

			// Copy the link.
			const copied = t >= T.copy + 0.02 && t < T.change + 0.4
			const copyIconFx = t < T.copy + 0.02 ? { o: 1, x: 0, y: 0, s: 1, blur: 0 } : copied ? exit(t, T.copy + 0.02, { dur: 0.1, scale: 0.6, y: 0 }) : enter(t, T.change + 0.4, { dur: 0.2, y: 0 })
			css(work.copyIcon, fxStyle(copyIconFx))
			css(work.checkIcon, fxStyle(copied ? enter(t, T.copy + 0.06, { spring: S.pop, scale: 0.5, y: 0, blur: 2 }) : { o: 0, x: 0, y: 0, s: 1, blur: 0 }))
			const hover = t > T.copy - 0.1 && t < T.change ? 1 : 0
			css(work.copyBtn, { background: hover ? D.surface2 : "transparent", color: hover ? D.text : D.text2, transform: `scale(${(1 - 0.08 * pressAt(t, T.copy)).toFixed(4)})` })
			const tipFx = presence(t, T.copy + 0.08, T.change, { spring: S.pop, y: -4, scale: 0.94, blur: 2, dur: 0.3 }, { dur: 0.14 })
			const btn = G.copyRect
			css(work.tip, { left: px(btn.x - G.panel.x + btn.w / 2 - 54), top: px(btn.y - G.panel.y + btn.h + 8), ...fxStyle(tipFx) })

			// Preview body: building state, log, then the site, then the changed site.
			css(work.state, fxStyle(windows(t, [[T.build, T.logTab], [T.changeSend + 0.05, T.changeLive]])))
			css(work.log, fxStyle(windows(t, [[T.logTab, T.previewTab + 0.12]])))
			css(work.frameLight, fxStyle(windows(t, [[T.previewTab, T.changeSend + 0.05]])))
			css(work.frameDark, fxStyle(windows(t, [[T.changeLive, null]], { blur: 6, dur: 0.4 })))
			// First version: the page loads in. After the change: the new version opens at its works section.
			css(work.shotFirst.canvas, fxStyle(enter(t, T.previewTab - 0.02, { y: 14, blur: 5, dur: 0.45, scale: 1 })))
			work.shotSecond.scrollTo((WORKS_TOP - 40) * ease.cubicInOut(progress(t, T.changeLive + 0.15, T.changeLive + 0.95)))

			const second = t >= T.changeSend
			const stages = second ? secondStages : firstStages
			const fixed = !second && t >= T.repair && t < T.built
			const current = stages.findIndex((s) => t >= s.live && t < s.done)
			const label = fixed ? "Building · 1 fix" : STAGES[Math.max(0, current)].label
			work.stateH2.forEach((el) => css(el, { opacity: el.dataset.h2 === label ? "1" : "0" }))
			text(work.stateTime, elapsed(second ? progress(t, T.changeSend, T.changeLive) * 41 : stops(t, ELAPSED)))
			css(work.stateImg, { transform: `translateY(${px(3 * Math.sin((2 * Math.PI * t) / 1.6))})` })
			work.stepDots.forEach((dot, i) => {
				const s = stages[i]
				const isLive = t >= s.live && t < s.done
				const isDone = t >= s.done || (i === STAGES.length - 1 && t >= s.live)
				css(dot.pending, { opacity: !isLive && !isDone ? "1" : "0" })
				css(dot.live, { opacity: isLive && !isDone ? "1" : "0", transform: `scale(${(0.8 + 0.2 * springAt(t, s.live, S.pop)).toFixed(4)})` })
				css(dot.done, { opacity: isDone ? "1" : "0", transform: `scale(${(0.5 + 0.5 * springAt(t, s.done === Infinity ? s.live : s.done, S.pop)).toFixed(4)})` })
				css(dot.label, { color: isLive && !isDone ? D.text : isDone ? D.text2 : D.text3, fontWeight: isLive && !isDone ? "600" : "400" })
			})

			// The log streams and follows its newest line.
			LOG.forEach((l, i) => css(work.logLines[i], fxStyle(enter(t, l.at, { y: 4, blur: 1.5, dur: 0.24 }))))
			css(work.logIn, { transform: `translateY(${px(-track(t, 0, logKeys))})` })
		}

		/* ── Pricing ─────────────────────────────────────────────────────── */
		{
			const hover = t > T.pricing + 0.75 && t < T.site ? ease.cubicOut(progress(t, T.pricing + 0.75, T.pricing + 0.95)) : 0
			pricing.cards.forEach((card, i) => {
				const fx = enter(t, T.pricing + 0.12 + i * 0.06, { y: 14, blur: 3, dur: 0.4 })
				css(card, {
					...fxStyle(fx),
					borderColor: i === 0 ? mixColor(D.line, D.lineStrong, hover) : D.line,
					boxShadow: i === 0 && hover > 0 ? `0 20px 50px -24px rgba(0,0,0,${(0.8 * hover).toFixed(3)})` : "none",
				})
			})
		}

		/* ── Captions ────────────────────────────────────────────────────── */
		for (const cap of captions) {
			const { c } = cap
			const active = t > c.at - 0.05 && t < c.out + 0.4
			// display, not visibility: a word span marked visible would show through a hidden parent.
			css(cap.el, { display: active ? "block" : "none" })
			if (cap.sub) css(cap.sub, fxStyle(presence(t, c.subAt, c.out, { y: 8, blur: 4, dur: 0.4 }, { dur: 0.22, y: -4, blur: 4 })))
			if (!active) continue
			for (const { span, i } of cap.spans) {
				const fx = combine(
					enter(t, c.at + i * 0.065, { y: 16, blur: 10, dur: 0.5, scale: 1 }),
					exit(t, c.out + i * 0.018, { y: -8, blur: 8, dur: 0.24, scale: 1 }),
				)
				css(span, fxStyle(fx))
			}
			if (cap.hl) {
				const at = c.at + cap.keyStart * 0.065 + 0.18
				const grow = ease.expoOut(progress(t, at, at + 0.5))
				const gone = 1 - ease.quadOut(progress(t, c.out, c.out + 0.22))
				css(cap.hlBg, { transform: `scaleX(${grow.toFixed(4)})`, opacity: opacityOf(gone) })
				css(cap.hl, { color: mixColor(C.text, C.accentInk, grow) })
			}
		}

		/* ── End card ────────────────────────────────────────────────────── */
		{
			const show = t >= T.end - 0.05
			// display, not visibility: children marked visible would otherwise show through.
			css(end, { display: show ? "block" : "none" })
			if (show) {
				const markIn = enter(t, T.end, { spring: S.pop, scale: 0.72, y: 10, blur: 8, dur: 0.5 })
				css(endMark, fxStyle(markIn))
				endLines.forEach((line, i) => css(line, { transform: `scaleX(${ease.expoOut(progress(t, T.end + 0.12 + i * 0.07, T.end + 0.5 + i * 0.07)).toFixed(4)})` }))
				const dot = springAt(t, T.end + 0.42, S.pop)
				css(endDot, { transform: `scale(${dot.toFixed(4)})` })
				const typedUrl = Math.floor(clamp(progress(t, T.end + 0.5, T.end + 0.95)) * URL_TEXT.length)
				urlChars.forEach((el, i) => css(el, { visibility: i < typedUrl ? "visible" : "hidden" }))
				const urlBlink = t < T.end + 1.1 || Math.floor((t - T.end - 1.1) / 0.5) % 2 === 1
				css(urlCaret, { left: px((typedUrl ? urlRight[typedUrl - 1] : urlLeft) + 3), opacity: t >= T.end + 0.45 && urlBlink ? "1" : "0" })
				css(endTag, fxStyle(enter(t, T.end + 1.05, { y: 8, blur: 4, dur: 0.45 })))
			}
		}

		/* ── Cursor ──────────────────────────────────────────────────────── */
		const c = cursor.at(t)
		const [sx, sy] = toScreen(cam, c.x, c.y)
		css(cursorEl, { transform: `translate(${(sx - 3).toFixed(2)}px, ${(sy - 2).toFixed(2)}px) scale(${(1 - 0.12 * c.press).toFixed(4)})`, opacity: c.opacity.toFixed(3) })
		css(ring, {
			left: px(sx - c.ring.r), top: px(sy - c.ring.r), width: px(2 * c.ring.r), height: px(2 * c.ring.r),
			opacity: (c.ring.o * c.opacity * 0.8).toFixed(3),
		})

		last = { t, cam: { ...cam, cx: cam.cx, cy: cam.cy }, shell: null, cursor: { world: [c.x, c.y], screen: [sx, sy] }, scene: sceneAt(t) }
		return last
	}

	return { seek, info: () => last, view: VIEW, measure: G }
}

export { DURATION }

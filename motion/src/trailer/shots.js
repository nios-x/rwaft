import { clamp, ease, lerp, mixColor, progress, seeded } from "../engine/math.js"
import { css, h } from "../engine/dom.js"
import { icons } from "../composition/icons.js"
import { HIT, b, h as half } from "./beatmap.js"
import { rotation } from "./gl.js"
import { plume, plumes, smokeLook } from "./smoke.js"

/**
 * Every shot of the trailer. A shot builds its DOM once (`build`), then
 * `update(t, u)` writes styles for film time t (u = time into the shot), and
 * `gl(t, u)` returns the WebGL passes for the back and front layers.
 *
 * The look is monochrome: black, zinc and white, black-glass panels, violet
 * only in the mark's endpoint, status colours where they mean something. The
 * one colourful moment is "rwaft AI" (the twisting ribbon over warm light).
 *
 * Copy is the product's own: chat replies are rwaft's plain-words notes
 * (frontend/lib/stages.ts), log lines are what build-services emits, claims
 * are from FEATURES.md. The demo sites are illustrative (site/*.html, rendered
 * to assets/ by scripts/site.mjs), with real photos the way rwaft's page writer
 * places them. The prompt, site ids, repository, PR number, change request and
 * timings are illustrative too.
 */

const PROMPT = "A portfolio for my design studio, KAIZEN"
const REPO_URL = "https://github.com/nios-x/portfolio"
const SITE_ID = "sojjxnmx"
const NEW_ID = "p3w8dn2r"
const SITE_IMG = "assets/kaizen-home.jpg"
/** The same screen after "Make the accent colour violet.", rendered, not filtered. */
const SITE_IMG_VIOLET = "assets/kaizen-home-violet.jpg"
const PAGE_IMG = (name) => `assets/kaizen-page-${name}.jpg`
/** Sites rwaft built, for the ring: KAIZEN and the home screen's three example prompts. */
const GALLERY = ["kaizen-home", "cafe-home", "habits-today", "rsvp-invite", "kaizen-works", "cafe-menu", "habits-stats", "rsvp-form", "kaizen-about", "kaizen-contact"].map((n) => `assets/gallery-${n}.jpg`)

const P = progress
const E = { ...ease, quadIn: (u) => u * u }
const lock = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.6" y="7.2" width="8.8" height="6.4" rx="1.4"/><path d="M5.4 7.2V5.4a2.6 2.6 0 0 1 5.2 0v1.8"/></svg>`
const cross = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m4.6 4.6 6.8 6.8M11.4 4.6l-6.8 6.8"/></svg>`
const ico = (name) => `<span class="ico">${name === "lock" ? lock : name === "cross" ? cross : icons[name]}</span>`
const MARK_SVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none"><rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#fafafa"/><g stroke="#0a0a0b" stroke-width="2.1" stroke-linecap="round"><path d="M6.6 9.6h6.4"/><path d="M6.6 14h8.9"/><path d="M6.6 18.4h5.4"/></g><circle cx="19.7" cy="14" r="2.6" fill="#8b72ff"/></svg>`
/** A studio wall behind UI shots: a faint grid and a soft corner light. */
const BG = `<div class="bg-grid"></div><div class="bg-corner"></div>`

const px = (n) => `${n.toFixed(2)}px`
const op = (o) => (o <= 0.001 ? "0" : o >= 0.999 ? "1" : o.toFixed(3))
const vis = (o) => (o <= 0.001 ? "hidden" : "visible")
const blurF = (b) => (b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none")
/** Decays from 1 at `at` toward 0 with rate k; 0 before `at`. */
const kick = (t, at, k = 10) => (t < at ? 0 : Math.exp(-(t - at) * k))
/** Moves the gradient reflection across a black-glass surface (k: 0 → 1 over the shot). */
const sheen = (el, k) => el && el.style.setProperty("--sx", `${lerp(-34, 34, k).toFixed(2)}%`)

/* ── Keynote text cards ───────────────────────────────────────────────── */

/**
 * A line of keynote type: bold, each word filled top to bottom from white to
 * zinc, with a soft band of light that can travel across it. Words are separate
 * so they can drift apart.
 */
function textCard(parent, { text, sub, y = 540, size = 66, left = 0, right = 0 }) {
	const row = h("div", "card-text", parent)
	row.style.top = `${y}px`
	row.style.left = `${left}px`
	row.style.right = `${right}px`
	row.style.transform = "translateY(-50%)"
	const line = h("span", "kt", row)
	line.style.fontSize = `${size}px`
	line.style.color = "transparent"
	line.style.backgroundImage = "none"
	const words = text.split(" ").map((word, i, all) => {
		const span = h("span", "kt-word", line, i < all.length - 1 ? `${word} ` : word)
		span.style.backgroundClip = "text"
		span.style.webkitBackgroundClip = "text"
		span.style.color = "transparent"
		return span
	})
	const subEl = sub ? h("span", "kt-sub", row, sub) : null
	return { row, line, words, subEl, measured: null }
}

function measureCard(card) {
	const box = card.line.getBoundingClientRect()
	card.measured = {
		width: box.width,
		words: card.words.map((w) => {
			const r = w.getBoundingClientRect()
			return { left: r.left - box.left, width: r.width }
		}),
	}
}

const FILL_TEXT = "linear-gradient(180deg, #ffffff 16%, #d4d4d8 52%, #6b6b74 100%)"

/**
 * Styles a card for time u in a shot of length dur. Every style rises out of a
 * soft defocus. sweep: a band of light crosses; fade: a dimmer, slower light;
 * blur: a longer resolve; spread: sweep, then the words drift apart.
 */
function drawCard(card, u, dur, { style = "sweep", from = -0.2, to = 1.25, band = 0.16, soft = 0.22, push = 0.03, delay = 0 } = {}) {
	if (!card.measured) measureCard(card)
	const { width: W, words } = card.measured
	const inO = E.quadOut(P(u, delay, delay + 0.09))
	const outO = 1 - E.quadIn(P(u, dur - 0.11, dur))
	const rv = E.cubicOut(P(u, delay, delay + Math.min(style === "blur" ? 0.3 : 0.22, dur * 0.55)))
	let center = lerp(from, to, E.sineInOut(P(u, delay, dur - 0.05))) * W
	let blur = 12 * (1 - rv)
	let scale = 1 + push * P(u, 0, dur)
	let glint = 0.9
	if (style === "fade") glint = 0.4
	if (style === "blur") {
		blur = 22 * (1 - rv)
		scale *= lerp(1.06, 1, rv)
		glint = 0.55
	}
	const bw = band * W
	const sw = soft * W
	words.forEach((w, i) => {
		const c = center - w.left
		const light = `linear-gradient(90deg, rgba(255,255,255,0) ${px(c - bw - sw)}, rgba(255,255,255,${glint}) ${px(c - bw)}, rgba(255,255,255,${glint}) ${px(c + bw)}, rgba(255,255,255,0) ${px(c + bw + sw)})`
		let dx = 0
		if (style === "spread") {
			const k = E.cubicInOut(P(u, dur * 0.55, dur * 0.97))
			dx = (w.left + w.width / 2 - W / 2) * 0.42 * k
		}
		css(card.words[i], { backgroundImage: `${light}, ${FILL_TEXT}`, transform: dx ? `translateX(${px(dx)})` : "none" })
	})
	const o = inO * outO
	css(card.row, {
		opacity: op(o),
		visibility: vis(o),
		transform: `translateY(calc(-50% + ${px(16 * (1 - rv))})) scale(${scale.toFixed(4)})`,
		filter: `${blurF(blur)} drop-shadow(0 0 22px rgba(255,255,255,0.12))`,
	})
	if (card.subEl) {
		const s = E.quadOut(P(u, delay + 0.1, delay + 0.3)) * outO
		css(card.subEl, { opacity: op(s) })
	}
}

/** A shot that is only a text card, on black with a soft corner light. */
const cardShot = (spec, drawOptions = {}) => ({
	build(el) {
		el.innerHTML = `<div class="bg-corner"></div>`
		return { card: textCard(el, spec) }
	},
	update(t, u, r, shot) {
		drawCard(r.card, u, shot.to - shot.from, drawOptions)
	},
	vignette: 0.4,
})

/* ── Shared UI fragments ──────────────────────────────────────────────── */

const promptBoxHTML = ({ text = "", mode = "prompt" } = {}) => `
	<div class="ptext"><span class="typed">${text}</span><span class="caret"></span></div>
	<div class="pbar">
		<div class="mode">
			<span${mode === "prompt" ? " data-on" : ""}>${ico("spark")}Describe an app</span>
			<span${mode === "repo" ? " data-on" : ""}>${ico("repo")}GitHub repo</span>
		</div>
		<span class="cost">1 credit · 2 left</span>
		<span class="send">${ico("send")}</span>
	</div>`

const winBar = (id, state = "live", label = "Live") => `
	<div class="win-bar">
		<div class="dots"><i></i><i></i><i></i></div>
		<div class="addr">${ico("lock")}https://<b class="site-id">${id}</b>.rwaft.live/</div>
		<span class="pill" data-s="${state}"><i></i>${label}</span>
	</div>`

/** Prefix widths for the typed prompt, so cameras can follow the caret. */
function prefixWidths(text, font, tracking) {
	const ctx = document.createElement("canvas").getContext("2d")
	ctx.font = font
	if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`
	return Array.from({ length: text.length + 1 }, (_, i) => ctx.measureText(text.slice(0, i)).width)
}
const widthAt = (widths, n) => {
	const i = Math.floor(clamp(n, 0, widths.length - 1))
	const f = clamp(n, 0, widths.length - 1) - i
	return lerp(widths[i], widths[Math.min(i + 1, widths.length - 1)], f)
}

/* ── The twisting ribbon (rwaft AI) ───────────────────────────────────── */

/*
 * After the "Twisting Ribbon" component (VengeanceUI): a band that twists
 * along a double sine, its width the cosine of the twist, its face burning
 * orange and its folds cycling lime, blue and cyan. Drawn from film time.
 */
const RIBBON = { face: [255, 60, 10], a: [180, 255, 0], b: [60, 80, 255], c: [0, 220, 255] }
const mixRGB = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]
function foldColor(frac, time) {
	const cy = (((frac * 2 + time * 0.3) % 1) + 1) % 1
	if (cy < 1 / 3) return mixRGB(RIBBON.a, RIBBON.b, cy * 3)
	if (cy < 2 / 3) return mixRGB(RIBBON.b, RIBBON.c, (cy - 1 / 3) * 3)
	return mixRGB(RIBBON.c, RIBBON.a, (cy - 2 / 3) * 3)
}
function drawRibbon(g, dpr, time, reveal) {
	const W = 1920
	const H = 1080
	const N = 460
	const HALF = 34
	g.setTransform(dpr, 0, 0, dpr, 0, 0)
	g.clearRect(0, 0, W, H)
	const pts = []
	for (let i = 0; i <= N; i++) {
		const f = i / N
		pts.push([f * W * 1.4 - W * 0.2, H * 0.62 + Math.sin(f * Math.PI * 3.5 + time * 0.7) * 230 + Math.sin(f * Math.PI * 7 + time * 1.1) * 62])
	}
	const tops = []
	const bots = []
	const tw = []
	for (let i = 0; i <= N; i++) {
		const a = pts[Math.max(0, i - 1)]
		const c = pts[Math.min(N, i + 1)]
		const dx = c[0] - a[0]
		const dy = c[1] - a[1]
		const len = Math.hypot(dx, dy) || 1
		const nx = -dy / len
		const ny = dx / len
		const twist = Math.cos((i / N) * Math.PI * 6 + time * 0.5)
		const w = HALF * Math.abs(twist) * Math.sign(twist || 1)
		tw.push(twist)
		tops.push([pts[i][0] + nx * w, pts[i][1] + ny * w])
		bots.push([pts[i][0] - nx * w, pts[i][1] - ny * w])
	}
	const end = Math.floor(N * reveal)
	for (let i = 0; i < end; i++) {
		const col = mixRGB(foldColor(i / N, time), RIBBON.face, Math.abs(tw[i]) ** 1.2)
		const fill = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`
		g.fillStyle = fill
		g.strokeStyle = fill
		g.lineWidth = 1.2
		g.beginPath()
		g.moveTo(tops[i][0], tops[i][1])
		g.lineTo(tops[i + 1][0], tops[i + 1][1])
		g.lineTo(bots[i + 1][0], bots[i + 1][1])
		g.lineTo(bots[i][0], bots[i][1])
		g.closePath()
		g.fill()
		g.stroke()
	}
	// a faint white edge where the band turns toward us
	g.strokeStyle = "rgba(255,255,255,0.22)"
	g.lineWidth = 1.4
	g.beginPath()
	for (let i = 0; i < end; i++) {
		if (Math.abs(tw[i]) < 0.08) continue
		g.moveTo(tops[i][0], tops[i][1])
		g.lineTo(tops[i + 1][0], tops[i + 1][1])
	}
	g.stroke()
}

/* ── The shots ────────────────────────────────────────────────────────── */

export const SHOT_DEFS = {
	/* 0 – 1.03 s. A dark studio: the prompt box turns toward us as a sentence is typed. */
	type: {
		vignette: 0.7,
		build(el) {
			el.innerHTML = `
				<div class="persp" style="perspective:2400px">
					<div class="center p3d rig">
						<div class="floor-light" style="left:-640px;top:230px;width:1280px;height:150px"></div>
						<div class="q" style="left:-520px;top:-300px;background:linear-gradient(180deg,#fff 20%,#a1a1aa);-webkit-background-clip:text;background-clip:text;color:transparent">What should we build?</div>
						<div class="q-sub" style="left:-518px;top:-196px">Describe an app in plain words. rwaft writes it, builds it and hosts it.</div>
						<div class="pbox" data-focus style="left:-520px;top:-128px">${promptBoxHTML()}<div class="gloss"></div></div>
						<div class="chips" style="left:-520px;top:120px"><span>A menu page for a small café</span><span>A habit tracker with streaks</span><span>An RSVP page for a party</span></div>
					</div>
				</div>`
			return { rig: el.querySelector(".rig"), typed: el.querySelector(".typed"), gloss: el.querySelector(".gloss") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, b(1)))
			const rx = lerp(20, 9, k)
			const ry = lerp(-26, -12, k)
			const z = lerp(-260, 10, E.cubicOut(P(u, 0, b(1))))
			css(r.rig, { transform: `translate3d(60px, 70px, ${px(z)}) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(1.34)` })
			const n = Math.floor(lerp(0, 17, P(u, 0.1, 1.0)))
			r.typed.textContent = PROMPT.slice(0, n)
			css(r.gloss, { transform: `translateX(${(lerp(-35, 30, k)).toFixed(2)}%)` })
		},
		gl: (t) => ({ back: [["wash", { u_exposure: E.cubicOut(P(t, 0, 0.35)), u_spot: [0.52, 0.86] }, { blend: false }]] }),
	},

	/* 1.03 – 1.78 s. Macro along the sentence, shallow focus riding the caret. */
	macro: {
		vignette: 0.7,
		build(el) {
			const box = (cls) => `<div class="pbox ${cls}" data-focus style="left:0;top:0;transform-origin:0 0">${promptBoxHTML()}</div>`
			el.innerHTML = `<div class="persp" style="perspective:1600px"><div class="center p3d rig">${box("soft")}${box("sharp")}</div></div>`
			const widths = prefixWidths(PROMPT, '400 30px "Geist"', -0.3)
			return { rig: el.querySelector(".rig"), soft: el.querySelector(".soft"), sharp: el.querySelector(".sharp"), typed: [...el.querySelectorAll(".typed")], widths }
		},
		update(t, u, r) {
			const n = lerp(17, PROMPT.length, E.quadOut(P(u, 0, 0.62)))
			for (const el of r.typed) el.textContent = PROMPT.slice(0, Math.floor(n))
			const cx = 34 + widthAt(r.widths, n - 0.6)
			const s = lerp(2.75, 3.05, P(u, 0, b(2) - b(1)))
			// keep the caret right of centre, so the written words trail into focus blur
			const tx = -cx * s + 260
			const ty = -64 * s
			const ry = lerp(-16, -10, P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(${px(tx)}, ${px(ty)}, 0) rotateY(${ry.toFixed(3)}deg) scale(${s.toFixed(4)})` })
			css(r.soft, { filter: "blur(5px)" })
			const m = `linear-gradient(90deg, transparent ${px(cx - 380)}, #000 ${px(cx - 150)}, #000 ${px(cx + 40)}, transparent ${px(cx + 260)})`
			css(r.sharp, { webkitMaskImage: m, maskImage: m })
		},
		gl: () => ({ back: [["wash", { u_exposure: 1.1, u_spot: [0.45, 0.9] }, { blend: false }]] }),
	},

	/* 1.78 – 2.51 s. Send is pressed; the lights go out and its point becomes the mark's violet endpoint. */
	send: {
		vignette: 0.7,
		build(el) {
			el.innerHTML = `
				<div class="abs box-wrap" style="left:0;top:0;transform-origin:0 0">
					<div class="pbox" data-focus style="left:0;top:0">${promptBoxHTML()}</div>
				</div>
				<div class="abs ripple" style="border-radius:50%;border:3px solid rgba(255,255,255,0.7)"></div>
				<div class="abs btn-dot" style="border-radius:50%;display:grid;place-items:center;color:#0a0a0b"><span class="ico arrow" style="font-size:52px">${icons.send}</span></div>
				<div class="abs haze" style="left:0;top:0;width:1920px;height:1080px"></div>`
			const q = (s) => el.querySelector(s)
			q(".pbox .send").style.visibility = "hidden"
			q(".pbox .caret").style.visibility = "hidden"
			return { wrap: q(".box-wrap"), ripple: q(".ripple"), dot: q(".btn-dot"), arrow: q(".arrow"), haze: q(".haze") }
		},
		update(t, u, r) {
			const DX = 1045.5
			const DY = 540
			const press = 1.949
			const out = half(2)
			const s = lerp(2.05, 2.35, E.sineInOut(P(t, b(2), out)))
			// the send button centre is at (990, 170) inside the box
			const lightsOff = E.cubicInOut(P(t, out, out + 0.16))
			css(r.wrap, { transform: `translate(${px(DX - 990 * s)}, ${px(DY - 170 * s)}) scale(${s.toFixed(4)})`, opacity: op(1 - lightsOff) })
			const pressK = Math.sin(Math.PI * clamp(P(t, press, press + 0.16)))
			const dSize = lerp(56 * s, 78, E.cubicInOut(P(t, out, out + 0.22))) * (1 - 0.08 * pressK)
			const breathe = t > out + 0.2 ? 1 + 0.06 * Math.sin((t - out - 0.2) * 9) : 1
			const colour = mixColor("#fafafa", "#8b72ff", E.cubicOut(P(t, out - 0.04, out + 0.14)))
			const glow = P(t, press, out + 0.2)
			const vi = P(t, out - 0.04, out + 0.14)
			const gc = vi > 0.5 ? "139,114,255" : "255,255,255"
			css(r.dot, {
				left: px(DX - (dSize * breathe) / 2), top: px(DY - (dSize * breathe) / 2), width: px(dSize * breathe), height: px(dSize * breathe),
				background: colour,
				boxShadow: `0 0 ${px(40 * glow)} ${px(10 * glow)} rgba(${gc},${(0.5 * glow).toFixed(3)}), 0 0 ${px(160 * glow)} ${px(30 * glow)} rgba(${gc},${(0.22 * glow).toFixed(3)})`,
			})
			css(r.arrow, { opacity: op(1 - P(t, out - 0.05, out + 0.1)) })
			const rp = P(t, press, press + 0.5)
			const rr = lerp(30, 340, E.cubicOut(rp))
			css(r.ripple, { left: px(DX - rr), top: px(DY - rr), width: px(rr * 2), height: px(rr * 2), opacity: op((1 - rp) * 0.6 * (rp > 0 ? 1 : 0)), visibility: vis(rp > 0 && rp < 1 ? 1 : 0) })
			const hz = E.cubicOut(P(t, out + 0.05, HIT[0]))
			css(r.haze, { background: `radial-gradient(420px 300px at ${DX}px ${DY}px, rgba(139,114,255,${(0.1 * hz).toFixed(3)}), transparent)` })
		},
		gl: (t) => ({ back: [["wash", { u_exposure: 1.1 * (1 - E.cubicInOut(P(t, half(2), half(2) + 0.16))), u_spot: [0.55, 0.62] }, { blend: false }]] }),
	},

	/* 2.51 – 3.27 s. Three hits, three log lines: the mark assembles around its endpoint. */
	hits: {
		build(el) {
			const S = 15
			const X = (x) => 960 + (x - 14) * S
			const Y = (y) => 540 + (y - 14) * S
			const lines = [[6.6, 13.0, 9.6], [6.6, 15.5, 14], [6.6, 12.0, 18.4]]
			el.innerHTML = `<div class="abs glow-bg" style="inset:0"></div><div class="abs rig" style="left:0;top:0;width:1920px;height:1080px;transform-origin:960px 540px"></div>`
			const rig = el.querySelector(".rig")
			const tile = h("div", "abs", rig)
			css(tile, { left: px(X(0.5)), top: px(Y(0.5)), width: px(27 * S), height: px(27 * S), borderRadius: px(8 * S), background: "#fafafa" })
			const streaks = lines.map(([, , y]) => {
				const s = h("div", "streak", el)
				s.style.top = px(Y(y) - 1.5)
				return s
			})
			const bars = lines.map(([x0, x1, y]) => {
				const bar = h("div", "abs", rig)
				return { el: bar, l: X(x0 - 1.05), r: X(x1 + 1.05), cy: Y(y) }
			})
			const dot = h("div", "abs", rig)
			css(dot, { left: px(X(19.7 - 2.6)), top: px(Y(14 - 2.6)), width: px(5.2 * S), height: px(5.2 * S), borderRadius: "50%", background: "#8b72ff" })
			return { rig, tile, bars, dot, streaks, glowBg: el.querySelector(".glow-bg"), S }
		},
		update(t, u, r) {
			const tileIn = E.cubicOut(P(t, HIT[2] + 0.03, HIT[2] + 0.22))
			r.bars.forEach((bar, i) => {
				const at = HIT[i]
				const k = E.expoOut(P(t, at, at + 0.2))
				const kl = E.expoOut(P(t, at + 0.02, at + 0.26))
				const right = lerp(-300, bar.r, k)
				const left = lerp(-2600, bar.l, kl)
				const th = lerp(6, 2.1 * r.S, E.cubicOut(P(t, at + 0.04, at + 0.2)))
				const on = t >= at ? 1 : 0
				const ink = mixColor("#ffffff", "#0a0a0b", tileIn)
				const burst = kick(t, at + 0.12, 7)
				css(bar.el, {
					left: px(left), top: px(bar.cy - th / 2), width: px(Math.max(0, right - left)), height: px(th), borderRadius: px(th / 2),
					background: ink, visibility: on ? "visible" : "hidden",
					boxShadow: `0 0 ${px(30 + 40 * burst)} rgba(255,255,255,${((0.6 + 0.3 * burst) * (1 - tileIn)).toFixed(3)})`,
				})
				const sk = P(t, at, at + 0.32)
				css(r.streaks[i], { opacity: op(t >= at ? (1 - E.quadOut(sk)) * 0.95 : 0), transform: `scaleY(${lerp(1, 0.3, sk).toFixed(3)})`, visibility: vis(t >= at && sk < 1 ? 1 : 0) })
			})
			css(r.tile, { opacity: op(tileIn), transform: `scale(${lerp(0.9, 1, tileIn).toFixed(4)})`, filter: blurF(16 * (1 - tileIn)), boxShadow: `0 0 ${px(120 * tileIn)} rgba(255,255,255,${(0.2 * tileIn).toFixed(3)})` })
			const kicks = HIT.reduce((s, at) => s + kick(t, at, 12) * 0.035, 0)
			const push = lerp(1, 1.06, P(t, HIT[0], b(4)))
			css(r.rig, { transform: `scale(${(push + kicks).toFixed(4)})` })
			css(r.dot, { boxShadow: `0 0 50px 12px rgba(139,114,255,0.55), 0 0 180px 40px rgba(139,114,255,0.2)` })
			const g = 0.04 + 0.06 * tileIn
			css(r.glowBg, { background: `radial-gradient(700px 500px at 960px 540px, rgba(255,255,255,${g.toFixed(3)}), transparent)` })
		},
		flash: (t) => HIT.reduce((s, at, i) => s + kick(t, at, 18) * [0.1, 0.13, 0.2][i], 0),
	},

	/* 3.27 – 4.02 s. The mark, a real object, rises as smoke billows up and rolls around it. */
	smoke: {
		build() { return {} },
		update() {},
		gl(t, u) {
			const k = E.cubicOut(P(u, 0, 0.75))
			const rimHit = kick(t, 3.628, 6)
			const rx = lerp(-66, -42, k)
			const ry = lerp(26, 12, k)
			const rz = lerp(-10, -4, k)
			const y = lerp(-0.62, -0.1, k)
			return {
				back: [
					["smoke", smokeLook(plume({ seed: 11, from: [-0.05, -0.14], to: [1.05, -0.14], t0: b(4) - 0.55, window: 1.0, count: 38, spread: 32, speed: [0.35, 0.8], drag: 1.2, size: [0.1, 0.2], grow: 0.9, rise: 0.04 }, t), { u_light: [0.5, 0.95], u_glow: 1.3 + rimHit, u_opaque: 1, u_seed: 11 }), { blend: false }],
					["mark", { u_rot: rotation(rx, ry, rz), u_pos: [0, y, 0], u_size: 0.78, u_fov: 0.3, u_camZ: 4.6 - 0.5 * k, u_exposure: 1.25, u_dot: 1.15 + rimHit * 0.6, u_rim: 2.4 + 2 * rimHit, u_white: 0, u_envSpin: -0.3 + 0.4 * k }],
				],
				front: [
					["smoke", smokeLook(plumes([
						{ seed: 23, from: [-0.08, -0.16], to: [0.36, -0.16], t0: b(4) - 0.3, window: 0.9, count: 20, angle: 80, spread: 30, speed: [0.25, 0.5], drag: 1.4, size: [0.08, 0.15], grow: 0.8 },
						{ seed: 29, from: [0.64, -0.16], to: [1.08, -0.16], t0: b(4) - 0.25, window: 0.9, count: 20, angle: 100, spread: 30, speed: [0.25, 0.5], drag: 1.4, size: [0.08, 0.15], grow: 0.8 },
					], t), { u_light: [0.5, 0.95], u_seed: 23, u_glow: 1.2 })],
				],
			}
		},
		motion: (t0, t1) => Math.abs(lerp(-0.62, -0.1, E.cubicOut(P(t1 - b(4), 0, 0.75))) - lerp(-0.62, -0.1, E.cubicOut(P(t0 - b(4), 0, 0.75)))) * 420 + 6,
	},

	/* 4.02 – 4.77 s. The live site from table height, light pouring out beneath it. */
	rim: {
		build(el) {
			const rnd = seeded(7)
			const motes = Array.from({ length: 54 }, () => `<i style="left:${(rnd() * 1920).toFixed(0)}px;top:${(300 + rnd() * 560).toFixed(0)}px;width:${(2 + rnd() * 4).toFixed(1)}px;height:${(2 + rnd() * 4).toFixed(1)}px;opacity:${(0.15 + rnd() * 0.55).toFixed(2)}"></i>`).join("")
			el.innerHTML = `
				<div class="abs under" style="left:60px;top:470px;width:1800px;height:380px;border-radius:50%"></div>
				<div class="abs halo" style="left:0;top:0;width:1920px;height:1080px"></div>
				<div class="persp" style="perspective:1400px;perspective-origin:50% 35%">
					<div class="center p3d rig">
						<div class="win" style="left:-700px;top:-430px;width:1400px;height:860px;border-color:#2c2c30">
							${winBar(SITE_ID)}
							<div class="win-body"><img src="${SITE_IMG}" alt=""></div>
							<div class="site-tint" style="background:linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.55) 70%, rgba(40,40,44,0.4))"></div>
						</div>
						<div class="abs edge" style="left:-700px;top:430px;width:1400px;height:24px;transform-origin:50% 0;transform:rotateX(-90deg);border-radius:0 0 14px 14px;background:linear-gradient(180deg,#3a3a3f,#111113 45%,#0a0a0b 80%,#e4e4e7)"></div>
					</div>
				</div>
				<div class="abs floor" style="left:0;top:0;width:1920px;height:1080px"></div>
				<div class="abs motes" style="inset:0">${motes}</div>`
			for (const m of el.querySelectorAll(".motes i")) Object.assign(m.style, { position: "absolute", borderRadius: "50%", background: "#f4f4f5", filter: "blur(1px)" })
			return { rig: el.querySelector(".rig"), under: el.querySelector(".under"), halo: el.querySelector(".halo"), floor: el.querySelector(".floor"), motes: el.querySelector(".motes") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, 0.75))
			const rx = lerp(86.5, 80, k)
			const z = lerp(-380, 40, k)
			css(r.rig, { transform: `translate3d(0, -36px, ${px(z)}) rotateX(${rx.toFixed(3)}deg) rotateZ(${lerp(-1.5, 0.5, k).toFixed(3)}deg)` })
			const L = 0.35 + 0.65 * E.cubicOut(P(u, 0, 0.35))
			// the slab's front edge sits near y ≈ 640; the light spills from beneath it
			const edgeY = lerp(612, 660, k)
			css(r.under, { top: px(edgeY - 190), background: `radial-gradient(closest-side, rgba(255,255,255,${(1 * L).toFixed(3)}), rgba(228,228,234,${(0.62 * L).toFixed(3)}) 22%, rgba(160,160,170,${(0.22 * L).toFixed(3)}) 52%, transparent)`, filter: "blur(10px)", transform: `scaleX(${lerp(0.8, 1.05, k).toFixed(3)})` })
			css(r.halo, { background: `radial-gradient(1500px 420px at 50% ${px(edgeY - 40)}, rgba(255,255,255,${(0.1 * L).toFixed(3)}), transparent 70%)` })
			css(r.floor, { background: `radial-gradient(1300px 70px at 50% ${px(edgeY + 22)}, rgba(255,255,255,${(0.85 * L).toFixed(3)}), rgba(220,220,228,${(0.28 * L).toFixed(3)}) 40%, transparent 75%)` })
			css(r.motes, { transform: `translate(${px(lerp(0, -40, k))}, ${px(lerp(0, -30, k))})`, opacity: op(0.85 * L) })
		},
	},

	/* 4.77 – 5.52 s. The build engine: a chip blazing on a black board of pipeline stages. */
	chip: {
		build(el) {
			const rnd = seeded(42)
			const W = 2600
			const H = 1700
			const cx = W / 2
			const cy = H / 2
			const paths = []
			for (let i = 0; i < 34; i++) {
				const side = i % 4
				const off = (rnd() - 0.5) * 240
				let x = side === 0 ? cx + 170 : side === 1 ? cx - 170 : cx + off
				let y = side === 2 ? cy + 170 : side === 3 ? cy - 170 : cy + off
				let d = `M${x.toFixed(0)} ${y.toFixed(0)}`
				const dirX = side === 0 ? 1 : side === 1 ? -1 : 0
				const dirY = side === 2 ? 1 : side === 3 ? -1 : 0
				for (let s = 0; s < 4; s++) {
					const len = 80 + rnd() * 260
					if (s % 2 === 0) { x += dirX * len; y += dirY * len }
					else if (dirX) y += (rnd() - 0.5) * 320
					else x += (rnd() - 0.5) * 320
					d += ` L${x.toFixed(0)} ${y.toFixed(0)}`
				}
				paths.push(d)
			}
			const svg = `<svg class="abs" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="left:0;top:0">
				${paths.map((d) => `<path d="${d}" fill="none" stroke="#202024" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}
				${paths.map((d, i) => `<path class="pulse" d="${d}" pathLength="1000" fill="none" stroke="${i % 3 ? "#ffffff" : "#a1a1aa"}" stroke-width="4" stroke-linecap="round" stroke-dasharray="70 2000" style="filter:drop-shadow(0 0 6px rgba(255,255,255,0.8))"/>`).join("")}
			</svg>`
			const comps = ["SETTING UP", "DESIGNING", "WRITING PAGES", "BUILDING", "PUBLISHING", "LIVE", "REPAIR", "VITE", "REACT", "TYPESCRIPT", "USABILITY", "PHOTOS", "LOG STREAM", "rwaft.live"]
			const places = [[-700, -420], [520, -460], [-820, 120], [640, 140], [-380, 520], [420, 560], [-160, -620], [860, -180], [-1060, -160], [1040, 420], [-980, 520], [160, 700], [-520, -180], [300, -300]]
			const compHTML = comps.map((c, i) => `<div class="comp" style="left:${cx + places[i][0]}px;top:${cy + places[i][1]}px;width:${c.length * 13 + 60}px;height:58px">${c}</div>`).join("")
			el.innerHTML = `
				<div class="persp" style="perspective:1700px">
					<div class="center p3d rig">
						<div class="board" style="left:${-cx}px;top:${-cy}px;width:${W}px;height:${H}px">${svg}${compHTML}
							<div class="bloom wide" style="left:${cx - 900}px;top:${cy - 900}px;width:1800px;height:1800px"></div>
							<div class="bloom ring" style="left:${cx - 300}px;top:${cy - 300}px;width:600px;height:600px"></div>
							<div class="chip" style="left:${cx - 160}px;top:${cy - 160}px;width:320px;height:320px">${MARK_SVG(74).replace('fill="#fafafa"', 'fill="#0a0a0b"').replace('stroke="#0a0a0b"', 'stroke="#fafafa"')}<div class="chip-name">rwaft</div><div class="chip-tag">BUILD ENGINE</div></div>
							<div class="bloom core" style="left:${cx - 260}px;top:${cy - 260}px;width:520px;height:520px"></div>
						</div>
					</div>
				</div>
				<div class="abs flare" style="left:0;top:534px;width:1920px;height:12px"></div>`
			return { rig: el.querySelector(".rig"), pulses: [...el.querySelectorAll(".pulse")], wide: el.querySelector(".wide"), ring: el.querySelector(".ring"), core: el.querySelector(".core"), flare: el.querySelector(".flare") }
		},
		update(t, u, r) {
			const k = E.cubicOut(P(u, 0, 0.75))
			const s = lerp(2.05, 1.2, k)
			css(r.rig, { transform: `scale(${s.toFixed(4)}) rotateX(${lerp(34, 16, k).toFixed(3)}deg) rotateZ(${lerp(-14, -5, k).toFixed(3)}deg)` })
			r.pulses.forEach((p, i) => css(p, { strokeDashoffset: (-((u * 900 + i * 137) % 1070) + 70).toFixed(1) }))
			const blaze = 1 - 0.45 * E.cubicOut(P(u, 0, 0.5))
			css(r.wide, { background: `radial-gradient(closest-side, rgba(255,255,255,${(0.42 * blaze).toFixed(3)}), rgba(255,255,255,${(0.12 * blaze).toFixed(3)}) 30%, rgba(255,255,255,0.03) 55%, transparent)` })
			css(r.core, { background: `radial-gradient(closest-side, rgba(255,255,255,${(0.75 * blaze).toFixed(3)}), rgba(255,255,255,${(0.25 * blaze).toFixed(3)}) 55%, transparent)`, mixBlendMode: "screen" })
			css(r.ring, { border: "6px solid transparent", borderRadius: "50%", background: "conic-gradient(from 0deg, rgba(255,255,255,0.75), rgba(161,161,170,0.35), rgba(255,255,255,0.6), rgba(82,82,91,0.3), rgba(255,255,255,0.75)) border-box", webkitMask: "linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0)", maskComposite: "exclude", filter: "blur(5px)", opacity: op(0.8 * blaze), transform: `scale(${lerp(0.9, 1.08, k).toFixed(3)}) rotate(${(u * 40).toFixed(2)}deg)` })
			css(r.flare, { background: `linear-gradient(90deg, transparent, rgba(255,255,255,${(0.3 * blaze).toFixed(3)}) 30%, rgba(255,255,255,${(0.85 * blaze).toFixed(3)}) 50%, rgba(255,255,255,${(0.3 * blaze).toFixed(3)}) 70%, transparent)`, filter: "blur(3px)", transform: `translateY(${px(lerp(-20, 30, k))}) scaleY(${lerp(1, 0.4, k).toFixed(3)})` })
		},
	},

	"card-real": cardShot({ text: "No spinners. Just the real build." }),

	/* 6.26 – 7.01 s. Flying low over a field of streaming log lines. */
	logs: {
		build(el) {
			const rnd = seeded(5)
			const msgs = [
				["", "Starting prompt job sojjxnmx"], ["", "Scaffolding a fresh Vite + React + TypeScript project..."], ["success", "Dependencies installed"],
				["", "Planning your app: pages, colours and fonts…"], ["", "Planned 4 pages (Home, Works, Studio, Contact) · bold · Bricolage Grotesque + Instrument Serif"],
				["", "Asking the AI to write your application..."], ["debug", "  [ai] Iteration 1 — sending 4 messages"], ["debug", "  [ai] tool_calls: 14"],
				["", "AI wrote 14 files across 4 pages"], ["", "Building project..."], ["debug", "vite v6.3.5 building for production..."],
				["debug", "✓ 1284 modules transformed."], ["debug", "✓ built in 2.91s"], ["success", "Build succeeded"], ["", "Uploading 7 build artifacts..."],
				["success", "Uploaded 7 artifacts"], ["success", "Deployment sojjxnmx is live"],
			]
			let rows = ""
			for (let i = 0; i < 96; i++) {
				const cols = [0, 1, 2].map((c) => {
					const [lvl, msg] = msgs[(i * 7 + c * 5 + Math.floor(rnd() * 5)) % msgs.length]
					const mm = String(32 + Math.floor(i / 9)).padStart(2, "0")
					const ss = String((i * 13 + c * 7) % 60).padStart(2, "0")
					const indent = Math.floor(rnd() * 3) * 70
					return `<span data-l="${lvl}" style="display:inline-block;width:1040px;overflow:hidden;padding-left:${indent}px;opacity:${(0.5 + rnd() * 0.5).toFixed(2)}"><span class="ts">14:${mm}:${ss}</span>${msg}</span>`
				})
				rows += `<div>${cols.join("")}</div>`
			}
			el.innerHTML = `
				<div class="abs horizon" style="left:0;top:0;width:1920px;height:1080px;background:radial-gradient(1400px 260px at 50% 330px, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 50%, transparent 75%)"></div>
				<div class="persp" style="perspective:900px;perspective-origin:50% 25%">
					<div class="abs plane-wrap p3d" style="left:-600px;top:-1300px;width:3120px;height:2600px;transform-origin:50% 100%;transform:rotateX(72deg);overflow:hidden">
						<div class="abs plane log" style="left:0;top:0;width:3120px;font-size:30px;line-height:2.1;color:#e4e4e7;text-shadow:0 0 14px rgba(255,255,255,0.35)">${rows}${rows}</div>
					</div>
				</div>
				<div class="abs shade" style="inset:0;background:radial-gradient(900px 220px at 50% 520px, rgba(0,0,0,0.78), transparent 75%)"></div>`
			const wrap = el.querySelector(".plane-wrap")
			const m = "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 30%, #000 60%)"
			wrap.style.webkitMaskImage = m
			wrap.style.maskImage = m
			return { plane: el.querySelector(".plane"), card: textCard(el, { text: "Every log line, streamed live.", y: 520 }) }
		},
		update(t, u, r, shot) {
			css(r.plane, { transform: `translateY(${px(-5400 + u * 1500)})` })
			drawCard(r.card, u, shot.to - shot.from, { from: -0.25, to: 1.3 })
		},
		motion: () => 1500 / 60 / 2,
	},

	/* 7.01 – 7.76 s. A build error glows red, the AI repairs it, the light turns green. */
	repair: {
		build(el) {
			const lines = [
				{ at: 0, ts: "14:33:41", msg: "Building project..." },
				{ at: 0, ts: "14:33:42", msg: "vite v6.3.5 building for production...", l: "debug" },
				{ at: 0.04, ts: "14:33:44", msg: "src/pages/Works.tsx(42,7): error TS2304: Cannot find name 'caseStudies'.", l: "error" },
				{ at: 0.374, ts: "14:33:44", msg: "Build step failed - asking the AI to repair (1/6)", l: "warn" },
				{ at: 0.47, ts: "14:33:58", msg: "Applied 2 repair operations" },
				{ at: 0.52, ts: "14:33:58", msg: "Building project..." },
				{ at: 0.57, ts: "14:34:01", msg: "✓ built in 2.91s", l: "debug" },
				{ at: 0.61, ts: "14:34:01", msg: "Build succeeded", l: "success" },
			]
			el.innerHTML = `${BG}
				<div class="abs ambient" style="inset:0"></div>
				<div class="persp" style="perspective:1700px">
					<div class="center p3d rig">
						<div class="panel" style="left:-640px;top:-300px;width:1280px;height:600px">
							<div class="panel-head"><span>Log</span><span class="muted">· ${PROMPT}</span><span class="pill" data-s="build" style="margin-left:auto"><i></i>Building</span></div>
							<div class="log" style="padding:22px 30px;font-size:21px;position:relative">${lines.map((l) => `<div data-l="${l.l ?? ""}"><span class="ts">${l.ts}</span>${l.msg}</div>`).join("")}</div>
							<div class="abs inner-glow" style="inset:0;pointer-events:none"></div>
						</div>
					</div>
				</div>`
			const rows = [...el.querySelectorAll(".log > div")]
			rows[2].style.background = "rgba(239,68,68,0.12)"
			rows[2].style.boxShadow = "inset 4px 0 0 #ef4444"
			rows[2].style.margin = "0 -30px"
			rows[2].style.padding = "0 30px"
			return { rig: el.querySelector(".rig"), rows, lines, ambient: el.querySelector(".ambient"), glow: el.querySelector(".inner-glow"), panel: el.querySelector(".panel"), card: textCard(el, { text: "Fixes its own errors.", y: 150 }) }
		},
		update(t, u, r, shot) {
			const k = E.sineInOut(P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(0, 120px, ${px(lerp(-120, 60, k))}) rotateX(${lerp(30, 20, k).toFixed(3)}deg) rotateY(${lerp(10, 3, k).toFixed(3)}deg) rotateZ(${lerp(-6, -2, k).toFixed(3)}deg) scale(1.2)` })
			r.rows.forEach((row, i) => {
				const a = E.cubicOut(P(u, r.lines[i].at, r.lines[i].at + 0.12))
				const dimErr = i === 2 ? 1 - 0.55 * P(u, 0.6, 0.7) : 1
				css(row, { opacity: op(a * dimErr), transform: `translateY(${px(5 * (1 - a))})`, filter: blurF(2 * (1 - a)) })
			})
			const red = 1 - P(u, 0.36, 0.42)
			const green = P(u, 0.6, 0.68)
			const orange = (1 - red) * (1 - green)
			const c = `rgba(${Math.round(239 * red + 249 * orange + 34 * green)},${Math.round(68 * red + 115 * orange + 197 * green)},${Math.round(68 * red + 22 * orange + 94 * green)}`
			const pulse = 0.8 + 0.2 * Math.sin(u * 18)
			css(r.ambient, { background: `radial-gradient(1100px 600px at 50% 62%, ${c},${(0.22 * pulse).toFixed(3)}), transparent 70%)` })
			css(r.glow, { background: `radial-gradient(900px 300px at 40% 45%, ${c},${(0.12 * pulse).toFixed(3)}), transparent 70%)` })
			css(r.panel, { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.09), 0 0 0 1.5px ${c},0.4), 0 0 80px ${c},0.28), 0 60px 120px rgba(0,0,0,0.8)` })
			sheen(r.panel, k)
			const pill = r.panel.querySelector(".pill")
			if (u > 0.68) { pill.dataset.s = "live"; pill.lastChild.textContent = "Built" } else { pill.dataset.s = "build"; pill.lastChild.textContent = "Building" }
			drawCard(r.card, u, shot.to - shot.from)
		},
	},

	/* 7.76 – 8.51 s. The plan, as a list: the highlight steps down the pages, each one previewed beside it. */
	pages: {
		build(el) {
			const rows = [["01", "Home", "Hero, selected work"], ["02", "Works", "Six projects"], ["03", "Studio", "Process and team"], ["04", "Contact", "Form and studios"]]
			el.innerHTML = `${BG}
				<div class="persp" style="perspective:1800px"><div class="center p3d rig">
					<div class="panel plist" style="left:-400px;top:-196px;width:960px">
						<div class="plist-hl"></div>
						${rows.map(([n, t, m], i) => `<div class="plist-row" data-i="${i}"><span class="n">${n}</span><span class="t">${t}</span><span class="m">${m}</span></div>`).join("")}
					</div>
					<div class="preview">${["home", "works", "about", "contact"].map((p) => `<img src="${PAGE_IMG(p)}" alt="">`).join("")}</div>
				</div></div>`
			return {
				rig: el.querySelector(".rig"), panel: el.querySelector(".plist"), hl: el.querySelector(".plist-hl"), rows: [...el.querySelectorAll(".plist-row")],
				preview: el.querySelector(".preview"), imgs: [...el.querySelectorAll(".preview img")],
				card: textCard(el, { text: "Plans, designs and writes every page.", y: 128 }),
			}
		},
		update(t, u, r, shot) {
			const k = E.cubicOut(P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(${px(lerp(30, 0, k))}, 70px, ${px(lerp(-140, 20, k))}) rotateX(${lerp(16, 7, k).toFixed(3)}deg) rotateY(${lerp(-16, -7, k).toFixed(3)}deg) scale(1.22)` })
			// the highlight steps every quarter beat, gliding quickly to each row
			const STEP = 0.187
			const f = clamp(u / STEP, 0, 3.999)
			const idx = Math.floor(f)
			const glide = E.cubicOut(clamp((f - idx) / 0.55))
			const yOf = (i) => 12 + i * 92
			const y = idx === 0 ? yOf(0) : lerp(yOf(idx - 1), yOf(idx), glide)
			css(r.hl, { top: px(y) })
			r.rows.forEach((row, i) => { if (i === idx) row.setAttribute("data-on", ""); else row.removeAttribute("data-on") })
			const enter = E.cubicOut(P(u, 0, 0.12))
			const lean = idx === 0 ? 0 : (1 - glide) * 7
			css(r.preview, { left: px(-400 - 268), top: px(-196 + y + 46 - 150), transform: `translateZ(60px) rotate(${(-5 + lean).toFixed(2)}deg) scale(${lerp(0.9, 1, enter).toFixed(3)})`, opacity: op(enter) })
			r.imgs.forEach((img, i) => {
				const o = i === idx ? (idx === 0 ? 1 : glide) : i === idx - 1 ? 1 - glide : 0
				css(img, { opacity: op(o) })
			})
			css(r.panel, { opacity: op(enter) })
			sheen(r.panel, k)
			drawCard(r.card, u, shot.to - shot.from)
		},
	},

	"card-pages": cardShot({ text: "Up to 5 pages from one sentence.", sub: "Real photos. A usability check on every page.", y: 520 }),

	/* 9.26 – 9.63 s. The live site pulls back into its own link. */
	site: {
		build(el) {
			el.innerHTML = `${BG}
				<div class="abs rig" style="left:180px;top:90px;width:1560px;height:920px;transform-origin:50% 55%">
					<div class="win" style="left:0;top:0;width:1560px;height:920px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.09), 0 0 0 1.5px rgba(255,255,255,0.1), 0 60px 140px rgba(0,0,0,0.85), 0 0 160px rgba(255,255,255,0.05)">${winBar(SITE_ID)}<div class="win-body"><img src="${SITE_IMG}" alt=""></div></div>
				</div>`
			return { rig: el.querySelector(".rig"), win: el.querySelector(".win") }
		},
		update(t, u, r) {
			const k = E.expoOut(P(u, 0, 0.36))
			const s = lerp(1.34, 1, k)
			css(r.rig, { transform: `translateY(${px(lerp(-150, 0, k))}) scale(${s.toFixed(4)})` })
			sheen(r.win, P(u, 0, 0.374))
		},
		motion: (t0, t1) => Math.abs(E.expoOut(P(t1 - b(12), 0, 0.36)) - E.expoOut(P(t0 - b(12), 0, 0.36))) * 900,
	},

	"card-dev": cardShot({ text: "Built for developers, too." }, { style: "fade" }),

	/* 10.38 – 10.75 s. Macro: a repository link in the prompt box, focus ring lit. */
	repo: {
		build(el) {
			const box = (cls) => `<div class="pbox ${cls}" data-focus style="left:0;top:0;transform-origin:0 0">${promptBoxHTML({ text: REPO_URL, mode: "repo" })}</div>`
			el.innerHTML = `${BG}
				<div class="persp" style="perspective:1500px"><div class="center p3d rig">${box("soft")}${box("sharp")}</div></div>
				<div class="abs" style="inset:0;background:radial-gradient(1000px 200px at 50% 540px, rgba(0,0,0,0.72), transparent 75%)"></div>`
			const sharp = el.querySelector(".sharp")
			const m = "linear-gradient(90deg, transparent 180px, #000 420px, #000 700px, transparent 980px)"
			sharp.style.webkitMaskImage = m
			sharp.style.maskImage = m
			el.querySelector(".soft").style.filter = "blur(6px)"
			return { rig: el.querySelector(".rig"), card: textCard(el, { text: "GitHub. GitLab. Bitbucket.", y: 540 }) }
		},
		update(t, u, r, shot) {
			const k = E.sineInOut(P(u, 0, 0.374))
			const s = lerp(2.3, 2.55, k)
			css(r.rig, { transform: `translate3d(${px(-560 * s)}, ${px(-90 * s)}, 0) rotateZ(${lerp(-7, -4, k).toFixed(3)}deg) rotateY(${lerp(16, 12, k).toFixed(3)}deg) scale(${s.toFixed(4)})` })
			drawCard(r.card, u, shot.to - shot.from, { from: 0.1, to: 1.2, band: 0.3 })
		},
	},

	/* 10.75 – 11.13 s. The deploy route's steps on a curved track, the line drawing down as each completes. */
	stages: {
		build(el) {
			const items = [["Setting up", 0, "0.4s"], ["Installing", 1, "14.2s"], ["Building", 0, "2.9s"], ["Publishing", 1, ""], ["Live", 0, ""]]
			const ROW = 100
			const IND = 48
			const xs = items.map(([, l]) => l * IND)
			let d = `M${xs[0]} ${ROW * 0.2}`
			items.forEach((_, i) => {
				d += ` L${xs[i]} ${i * ROW + ROW * 0.8}`
				if (i < items.length - 1) {
					const y0 = i * ROW + ROW * 0.8
					const y1 = (i + 1) * ROW + ROW * 0.2
					const ym = (y0 + y1) / 2
					d += ` C${xs[i]} ${ym} ${xs[i + 1]} ${ym} ${xs[i + 1]} ${y1}`
				}
			})
			const labels = items.map(([text, l, time], i) => `<div class="track-item" data-i="${i}" style="left:${l * IND + 46}px;top:${i * ROW + ROW / 2 - 23}px">${text}${time ? `<small>${time}</small>` : ""}</div>`).join("")
			el.innerHTML = `${BG}
				<div class="persp" style="perspective:1500px"><div class="center p3d rig">
					<div class="track" style="left:-640px;top:-250px">
						<svg width="10" height="10"><path class="base" d="${d}" fill="none" stroke="#2a2a2e" stroke-width="3" stroke-linecap="round"/><path class="lit" d="${d}" fill="none" stroke="#fafafa" stroke-width="3" stroke-linecap="round" pathLength="1000" stroke-dasharray="0 2000" style="filter:drop-shadow(0 0 6px rgba(255,255,255,0.7))"/><circle class="head" r="7" fill="#fff" style="filter:drop-shadow(0 0 10px #fff)"/></svg>
						${labels}
					</div>
				</div></div>`
			const lit = el.querySelector(".lit")
			return { rig: el.querySelector(".rig"), lit, base: el.querySelector(".base"), head: el.querySelector(".head"), labels: [...el.querySelectorAll(".track-item")], len: null, card: textCard(el, { text: "Vite or Create React App.", y: 540, left: 820, size: 62 }) }
		},
		update(t, u, r, shot) {
			const k = E.sineInOut(P(u, 0, 0.374))
			css(r.rig, { transform: `translateZ(${px(lerp(-40, 60, k))}) rotateY(${lerp(20, 13, k).toFixed(3)}deg) rotateX(${lerp(5, 2, k).toFixed(3)}deg)` })
			if (r.len === null) r.len = r.base.getTotalLength()
			// progress in items: from finishing "Installing" to arriving at "Publishing"
			const q = lerp(1.35, 3.25, E.cubicOut(P(u, 0.02, 0.32)))
			const frac = q / 5
			r.lit.setAttribute("stroke-dasharray", `${(frac * 1000).toFixed(1)} 2000`)
			const pt = r.base.getPointAtLength(r.len * frac)
			r.head.setAttribute("cx", pt.x.toFixed(2))
			r.head.setAttribute("cy", pt.y.toFixed(2))
			r.labels.forEach((el, i) => {
				const s = i + 0.5 < q ? "done" : i - 0.5 < q ? "now" : "pending"
				if (el.dataset.s !== s) el.dataset.s = s
			})
			drawCard(r.card, u, shot.to - shot.from, { style: "blur" })
		},
	},

	/* 11.13 – 11.87 s. The hero: a pull request rwaft opened, a black-glass card floating in the dark. */
	pr: {
		build(el) {
			const rnd = seeded(19)
			const bokeh = Array.from({ length: 14 }, () => {
				const s = 40 + rnd() * 160
				return `<i style="position:absolute;left:${(rnd() * 1920).toFixed(0)}px;top:${(rnd() * 1080).toFixed(0)}px;width:${s.toFixed(0)}px;height:${s.toFixed(0)}px;border-radius:50%;background:rgba(255,255,255,${(0.025 + rnd() * 0.05).toFixed(3)});filter:blur(${(4 + rnd() * 10).toFixed(0)}px)"></i>`
			}).join("")
			el.innerHTML = `${BG}<div class="abs bokeh" style="inset:0">${bokeh}</div>
				<div class="persp" style="perspective:1900px">
					<div class="center p3d rig">
						<div class="panel" style="left:-560px;top:-265px;width:1120px;height:530px">
							<div class="panel-head"><span class="ico" style="font-size:26px">${icons.github}</span>nios-x/portfolio<span class="muted">· Pull request</span><span class="pill" data-s="live" style="margin-left:auto"><i></i>Opened</span></div>
							<div style="position:relative;padding:34px 40px;display:grid;gap:26px">
								<div style="text-align:right"><span class="bubble">Add a dark mode toggle to the settings page</span></div>
								<div class="reply r0">Started on your pull request.</div>
								<div class="reply r1">Opening the pull request.</div>
								<div class="reply r2" data-tone="good" style="display:flex;align-items:center;gap:14px"><span class="disc" style="width:34px;height:34px;font-size:20px">${icons.checkBold}</span>Your pull request is open.</div>
								<div class="url r3" style="display:flex;align-items:center;gap:10px">github.com/nios-x/portfolio/pull/14 <span class="ico" style="font-size:22px">${icons.external}</span></div>
							</div>
						</div>
					</div>
				</div>`
			return { rig: el.querySelector(".rig"), panel: el.querySelector(".panel"), rows: [0, 1, 2, 3].map((i) => el.querySelector(`.r${i}`)), bokeh: el.querySelector(".bokeh") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(0, 10px, ${px(lerp(-60, 120, k))}) rotateY(${lerp(-22, -10, k).toFixed(3)}deg) rotateX(${lerp(10, 5, k).toFixed(3)}deg) scale(1.22)` })
			r.rows.forEach((row, i) => {
				const a = E.cubicOut(P(u, 0.06 + i * 0.12, 0.2 + i * 0.12))
				css(row, { opacity: op(a), transform: `translateY(${px(6 * (1 - a))})`, filter: blurF(3 * (1 - a)) })
			})
			css(r.bokeh, { transform: `translateX(${px(lerp(30, -30, k))})` })
			sheen(r.panel, k)
		},
	},

	"card-pr": cardShot({ text: "Pull requests on any GitHub repo." }),
	"card-ci": cardShot({ text: "Watches CI. Fixes failing checks." }),

	/* 13.37 – 13.74 s. The checks: a failure, a fix, all green. */
	checks: {
		build(el) {
			const rows = [["build", "fail"], ["lint", "pass"], ["test", "pass"]]
			el.innerHTML = `${BG}<div class="abs amb" style="inset:0"></div>
				<div class="persp" style="perspective:1700px"><div class="center p3d rig">
					<div class="panel" style="left:-560px;top:-260px;width:1120px;height:520px">
						<div class="panel-head">Checks<span class="muted">· nios-x/portfolio #14</span></div>
						${rows.map(([n]) => `<div class="check-row" data-n="${n}"><span class="check-icon"></span><span class="name">${n}</span><span class="state"></span></div>`).join("")}
						<div style="position:relative;padding:24px 30px"><span class="pill foot" style="height:46px;font-size:21px;padding:0 20px"><i></i><span></span></span></div>
					</div>
				</div></div>`
			return { rig: el.querySelector(".rig"), panel: el.querySelector(".panel"), rows: [...el.querySelectorAll(".check-row")], foot: el.querySelector(".foot"), amb: el.querySelector(".amb") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, 0.374))
			css(r.rig, { transform: `translateZ(${px(lerp(-80, 80, k))}) rotateX(${lerp(14, 8, k).toFixed(3)}deg) rotateY(${lerp(-12, -6, k).toFixed(3)}deg) scale(1.38)` })
			const phase = u < 0.12 ? "fail" : u < 0.24 ? "fixing" : "pass"
			const setRow = (row, state) => {
				const icon = row.querySelector(".check-icon")
				const label = row.querySelector(".state")
				const look = {
					fail: ["#ef4444", "#fff", "cross", "Failed", "#fca5a5"],
					fixing: ["rgba(249,115,22,0.18)", "#fdba74", "refresh", "Fixing it (try 1 of 2)…", "#fdba74"],
					pass: ["#22c55e", "#04130a", "check", "Passed", "#86efac"],
				}[state]
				if (row.dataset.state !== state) {
					row.dataset.state = state
					icon.innerHTML = ico(look[2])
					label.textContent = look[3]
				}
				css(icon, { background: look[0], color: look[1] })
				css(label, { color: look[4] })
			}
			setRow(r.rows[0], phase)
			setRow(r.rows[1], "pass")
			setRow(r.rows[2], "pass")
			const foot = phase === "pass" ? ["live", "All checks passed."] : ["build", "build failed. Fixing it (try 1 of 2)…"]
			r.foot.dataset.s = foot[0]
			if (r.foot.lastChild.textContent !== foot[1]) r.foot.lastChild.textContent = foot[1]
			const g = phase === "pass" ? "34,197,94" : phase === "fixing" ? "249,115,22" : "239,68,68"
			css(r.amb, { background: `radial-gradient(1200px 700px at 50% 55%, rgba(${g},0.16), transparent 70%)` })
			sheen(r.panel, k)
		},
	},

	"card-ask": cardShot({ text: "Change it by asking." }, { style: "spread", to: 1.1 }),

	/* 14.49 – 15.24 s. One message changes the live site; the new version gets its own link. */
	change: {
		build(el) {
			el.innerHTML = `${BG}
				<div class="persp" style="perspective:2200px"><div class="center p3d rig">
					<div class="win" style="left:-760px;top:-450px;width:1520px;height:900px">
						${winBar(SITE_ID)}
						<div class="win-body"><img class="a" src="${SITE_IMG}" alt=""><img class="v" src="${SITE_IMG_VIOLET}" alt="" style="position:absolute;left:0;top:0"><div class="abs scan" style="top:0;bottom:0;width:5px;background:linear-gradient(180deg,transparent,#ffffff,transparent);box-shadow:0 0 40px 10px rgba(255,255,255,0.45)"></div></div>
					</div>
					<div class="composer" style="left:-470px;top:300px;width:940px"><span class="typed"></span><span class="caret" style="height:34px"></span><span class="send">${ico("send")}</span></div>
				</div></div>`
			return { rig: el.querySelector(".rig"), win: el.querySelector(".win"), v: el.querySelector("img.v"), scan: el.querySelector(".scan"), typed: el.querySelector(".typed"), id: el.querySelector(".site-id"), composer: el.querySelector(".composer"), caret: el.querySelector(".composer .caret") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(0, 0, ${px(lerp(-120, 40, k))}) rotateX(${lerp(8, 3, k).toFixed(3)}deg) rotateY(${lerp(10, 4, k).toFixed(3)}deg)` })
			const msg = "Make the accent colour violet."
			r.typed.textContent = msg.slice(0, Math.floor(lerp(0, msg.length, P(u, 0.02, 0.26))))
			const sent = P(u, 0.29, 0.38)
			css(r.composer, { opacity: op(1 - E.cubicIn(sent)), transform: `translateY(${px(30 * E.cubicIn(sent))})` })
			const w = E.cubicInOut(P(u, 0.36, 0.6))
			css(r.v, { clipPath: `inset(0 ${(100 - w * 100).toFixed(2)}% 0 0)` })
			css(r.scan, { left: `${(w * 100).toFixed(2)}%`, opacity: op(w > 0 && w < 1 ? 1 : 0) })
			const id = u > 0.6 ? NEW_ID : SITE_ID
			if (r.id.textContent !== id) r.id.textContent = id
			sheen(r.win, k)
		},
	},

	/* 15.24 – 15.99 s. rwaft AI: the twisting ribbon over warm corner light, the film's one burst of colour. */
	ai: {
		vignette: 0.6,
		build(el, ctx) {
			const dpr = ctx.dpr || 1
			const canvas = h("canvas", "abs", el)
			canvas.width = Math.round(1920 * dpr)
			canvas.height = Math.round(1080 * dpr)
			Object.assign(canvas.style, { left: "0", top: "0", width: "1920px", height: "1080px", filter: "drop-shadow(0 0 26px rgba(255,90,30,0.45))" })
			const a = textCard(el, { text: "rwaft AI", y: 330, size: 88 })
			const c = textCard(el, { text: "Your AI app builder.", y: 330, size: 76 })
			return { a, c, g: canvas.getContext("2d"), dpr }
		},
		update(t, u, r) {
			drawRibbon(r.g, r.dpr, 2.4 + u * 2.8, E.cubicOut(P(u, 0, 0.32)))
			drawCard(r.a, u, half(20) - b(20), { style: "blur" })
			const v = u - (half(20) - b(20))
			if (v >= 0) drawCard(r.c, v, b(21) - half(20), { style: "blur" })
			else css(r.c.row, { visibility: "hidden" })
		},
		// hsl(14 100% 57%), hsl(45 100% 51%), hsl(340 82% 52%), in linear light
		gl: (t, u) => ({ back: [["gradient", { u_c1: [1, 0.105, 0.017], u_c2: [1, 0.56, 0.0], u_c3: [0.85, 0.024, 0.155], u_int: 0.3 * E.cubicOut(P(u, 0, 0.25)), u_soft: 0.6 }, { blend: false }]] }),
		motion: () => 12,
	},

	"card-plain": cardShot({ text: "Plain words in. A live link out." }, { from: -0.1, to: 1.35, band: 0.24 }),

	/* 16.36 – 17.11 s. The answer: your site is live. */
	live: {
		build(el) {
			el.innerHTML = `${BG}
				<div class="abs gflash" style="inset:0"></div>
				<div class="persp" style="perspective:2000px"><div class="center p3d rig">
					<div class="panel" style="left:-620px;top:-270px;width:1240px;height:540px;border-radius:40px;border:1.5px solid rgba(255,255,255,0.16);box-shadow:inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 8px rgba(10,10,12,0.9), 0 0 0 9.5px rgba(255,255,255,0.08), 0 90px 180px rgba(0,0,0,0.9)">
						<div style="position:relative;padding:52px 56px;display:grid;gap:30px">
							<div style="text-align:right"><span class="bubble" style="font-size:28px">${PROMPT}</span></div>
							<div class="reply" style="font-size:26px">Uploading the finished site.</div>
							<div class="row-live" style="display:flex;align-items:center;gap:22px"><span class="disc" style="width:64px;height:64px;font-size:36px">${icons.checkBold}</span><div class="reply" data-tone="good" style="font-size:34px;font-weight:500">Your site is live. <span style="color:#a1a1aa;font-weight:400">Share the link with anyone.</span></div></div>
							<div class="row-url" style="display:flex;align-items:center;gap:18px;padding:22px 26px;border-radius:22px;background:#111113;border:1.5px solid #2e2e33">
								<span class="url" style="font-size:30px">https://${SITE_ID}.rwaft.live/</span>
								<span class="btn btn-ink copy" style="margin-left:auto"><span class="ico">${icons.copy}</span><span>Copy</span></span>
								<span class="btn btn-line">Open <span class="ico">${icons.external}</span></span>
							</div>
						</div>
					</div>
				</div></div>`
			return { rig: el.querySelector(".rig"), panel: el.querySelector(".panel"), live: el.querySelector(".row-live"), url: el.querySelector(".row-url"), disc: el.querySelector(".row-live .disc"), copy: el.querySelector(".copy"), gflash: el.querySelector(".gflash") }
		},
		update(t, u, r) {
			const k = E.sineInOut(P(u, 0, 0.75))
			css(r.rig, { transform: `translate3d(0, 0, ${px(lerp(-160, 70, k))}) rotateX(${lerp(12, 4, k).toFixed(3)}deg) rotateY(${lerp(-16, -6, k).toFixed(3)}deg) scale(1.16)` })
			const pop = b(22)
			const a = E.cubicOut(P(t, pop - 0.08, pop + 0.08))
			const disc = t < pop ? 0 : 1 + 0.25 * Math.exp(-(t - pop) * 9) * Math.cos((t - pop) * 26)
			css(r.live, { opacity: op(a) })
			css(r.disc, { transform: `scale(${(t < pop ? 0.4 : disc).toFixed(4)})`, boxShadow: `0 0 ${px(60 * kick(t, pop, 4))} rgba(34,197,94,0.9)` })
			const ua = E.cubicOut(P(t, pop + 0.1, pop + 0.26))
			css(r.url, { opacity: op(ua), transform: `translateY(${px(10 * (1 - ua))})` })
			const copied = t > b(22) + 0.3
			const label = r.copy.lastChild
			if (label.textContent !== (copied ? "Copied" : "Copy")) {
				label.textContent = copied ? "Copied" : "Copy"
				r.copy.firstChild.innerHTML = copied ? icons.check : icons.copy
			}
			css(r.gflash, { background: `radial-gradient(900px 500px at 50% 50%, rgba(34,197,94,${(0.2 * kick(t, pop, 5)).toFixed(3)}), transparent 70%)` })
			sheen(r.panel, k)
		},
	},

	/* 17.11 – 17.86 s. A ring of sites rwaft built, spinning in around the mark, smoke on the floor. */
	gallery: {
		vignette: 0.9,
		build(el) {
			const N = 22
			const R = 600
			const W = 214
			const H = 134
			const cards = Array.from({ length: N }, (_, i) => `<div class="gcard" style="left:${-W / 2}px;top:${-H / 2}px;width:${W}px;height:${H}px"><img src="${GALLERY[i % GALLERY.length]}" alt=""><i></i></div>`).join("")
			el.innerHTML = `<div class="persp" style="perspective:1500px;perspective-origin:50% 36%"><div class="gring">${cards}</div></div>`
			return { ring: el.querySelector(".gring"), cards: [...el.querySelectorAll(".gcard")], shades: [...el.querySelectorAll(".gcard i")], N, R }
		},
		update(t, u, r) {
			const k = E.expoOut(P(u, 0, 0.75))
			const spin = lerp(-80, 0, k) + u * 14
			const tilt = lerp(66, 58, E.sineInOut(P(u, 0, 0.75)))
			css(r.ring, { transform: `translateY(10px) rotateX(${tilt.toFixed(3)}deg) rotateZ(${spin.toFixed(3)}deg)` })
			r.cards.forEach((card, i) => {
				const th = (i * 360) / r.N
				const appear = E.cubicOut(P(u, (i % 11) * 0.013, (i % 11) * 0.013 + 0.16))
				// each screen rides the ring but stays upright, facing us
				css(card, { transform: `rotateZ(${th.toFixed(2)}deg) translateY(${px(r.R)}) rotateZ(${(-(th + spin)).toFixed(2)}deg) rotateX(${(-tilt).toFixed(3)}deg) scale(${lerp(0.7, 1, appear).toFixed(3)})`, opacity: op(appear) })
				// the far side of the ring sits in shadow
				const facing = Math.cos(((th + spin) * Math.PI) / 180)
				css(r.shades[i], { opacity: op(0.6 * (1 - (facing + 1) / 2) ** 1.3) })
			})
		},
		gl: (t, u) => {
			const k = E.cubicOut(P(u, 0, 0.75))
			return {
				back: [
					["smoke", smokeLook(plume({ seed: 41, from: [-0.08, -0.1], to: [1.08, -0.1], t0: half(22) - 0.9, window: 1.4, count: 38, spread: 55, speed: [0.12, 0.3], drag: 1.0, size: [0.08, 0.16], grow: 0.55, rise: 0.02 }, t), { u_light: [0.5, 0.62], u_opaque: 1, u_seed: 41, u_glow: 1.1 }), { blend: false }],
					["mark", { u_rot: rotation(lerp(-34, -22, k), lerp(-30, 18, k), -4), u_pos: [0, 0.05, 0], u_size: 0.4, u_fov: 0.3, u_camZ: 4.6, u_exposure: 1.3, u_dot: 1.35, u_rim: 2.8, u_white: 0, u_envSpin: -0.4 + u }],
				],
				front: [["smoke", smokeLook(plume({ seed: 47, from: [-0.08, -0.14], to: [1.08, -0.14], t0: half(22) - 0.7, window: 1.3, count: 26, spread: 60, speed: [0.06, 0.18], drag: 1.0, size: [0.06, 0.12], grow: 0.5 }, t), { u_light: [0.5, 0.6], u_seed: 47, u_glow: 1.0, u_alpha: 0.9 })]],
			}
		},
		motion: (t0, t1) => Math.abs(lerp(-80, 0, E.expoOut(P(t1 - half(22), 0, 0.75))) - lerp(-80, 0, E.expoOut(P(t0 - half(22), 0, 0.75)))) * 14 + 4,
	},

	/* 17.86 – 18.61 s. The name in glossy black, light sliding over it, smoke rolling behind and below. */
	wordmark: {
		vignette: 1,
		build(el, ctx) {
			return { tex: ctx.chromeText("name") }
		},
		update() {},
		gl: (t, u, r) => {
			const k = E.sineInOut(P(u, 0, 0.75))
			const w = lerp(0.76, 0.84, k)
			return {
				back: [
					["smoke", smokeLook(plumes([
						{ seed: 51, from: [-0.12, -0.12], to: [0.34, -0.08], t0: half(23) - 0.65, window: 1.15, count: 20, angle: 64, spread: 30, speed: [0.2, 0.7], drag: 1.4, size: [0.055, 0.11], grow: 0.55, rise: 0.03, alpha: 0.9 },
						{ seed: 53, from: [0.66, -0.08], to: [1.12, -0.12], t0: half(23) - 0.6, window: 1.15, count: 20, angle: 116, spread: 30, speed: [0.2, 0.7], drag: 1.4, size: [0.055, 0.11], grow: 0.55, rise: 0.03, alpha: 0.9 },
					], t), { u_light: [0.5, 0.72], u_lit: [0.72, 0.73, 0.77], u_shade: [0.01, 0.011, 0.014], u_glow: 1.5, u_density: 1, u_erode: 0.78, u_detail: 4.2, u_opaque: 1, u_seed: 51, u_back: [0.5, 0.55, 0.36, 0.034] }), { blend: false }],
					// keep the texture's 2560 × 690 aspect while the camera pushes in
					["chrome", { ...r.tex, u_rect: [0.5 - w / 2, 0.53 - (w * 0.4795) / 2, 0.5 + w / 2, 0.53 + (w * 0.4795) / 2], u_sweep: lerp(-0.3, 1.5, k), u_ext: [-0.008, 0.1], u_alpha: 1, u_relief: 4.2 }],
				],
				front: [["smoke", smokeLook(plume({ seed: 61, from: [-0.06, -0.2], to: [1.06, -0.2], t0: half(23) - 0.2, window: 0.9, count: 18, spread: 40, speed: [0.12, 0.28], drag: 1.4, size: [0.06, 0.12], grow: 0.7, alpha: 0.8 }, t), { u_light: [0.5, 0.66], u_lit: [0.6, 0.61, 0.65], u_shade: [0.01, 0.011, 0.014], u_seed: 61, u_glow: 1.3, u_alpha: 0.85 })]],
			}
		},
		motion: () => 8,
	},

	/* 18.61 – 19.20 s. The mark and the address, over glossy black chrome arcs. */
	end: {
		vignette: 0.8,
		build(el) {
			el.innerHTML = `<div class="abs hush" style="inset:0;background:radial-gradient(520px 340px at 50% 50%, rgba(0,0,0,0.78), transparent 75%)"></div>
				<div class="abs logo" style="left:894px;top:404px;width:132px;height:132px">${MARK_SVG(132)}</div>
				<div class="abs ping" style="border-radius:50%;border:3px solid #8b72ff"></div>
				<div class="abs addr-end" style="left:0;right:0;top:572px;text-align:center;font:500 34px var(--sans);letter-spacing:-0.01em;color:#e4e4e7">rwaft.live</div>`
			return { logo: el.querySelector(".logo"), ping: el.querySelector(".ping"), addr: el.querySelector(".addr-end") }
		},
		update(t, u, r) {
			const a = E.cubicOut(P(u, 0, 0.22))
			const fadeOut = 1 - E.quadIn(P(t, 19.06, 19.2))
			css(r.logo, { opacity: op(a * fadeOut), filter: blurF(12 * (1 - a)), transform: `scale(${lerp(1.12, 1, a).toFixed(4)})` })
			const at = b(25)
			const pk = P(t, at, at + 0.4)
			const pr = lerp(20, 140, E.cubicOut(pk))
			// the endpoint dot sits at (19.7, 14) of 28 in the mark
			const dx = 894 + (19.7 / 28) * 132
			const dy = 404 + (14 / 28) * 132
			css(r.ping, { left: px(dx - pr), top: px(dy - pr), width: px(pr * 2), height: px(pr * 2), opacity: op(t >= at ? (1 - pk) * 0.9 * fadeOut : 0), visibility: vis(t >= at && pk < 1 ? 1 : 0) })
			const ad = E.cubicOut(P(u, 0.12, 0.32))
			css(r.addr, { opacity: op(ad * fadeOut), transform: `translateY(${px(8 * (1 - ad))})` })
		},
		gl: (t, u) => {
			const fade = E.cubicOut(P(u, 0, 0.3)) * (1 - E.quadIn(P(t, 19.06, 19.2)))
			return { back: [["arcs", { u_view: [910, 984, 1, 1], u_motion: [0.08 + u * 0.22, 26 * Math.sin(u * 2.4), 0.9], u_tint: [1, 0, 0, 0, 1, 0, 0, 0, 1], u_seed: Math.round(t * 30) % 97, u_fade: fade }, { blend: false }]] }
		},
	},
}

export { textCard, drawCard }

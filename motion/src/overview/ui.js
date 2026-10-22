import { h } from "../engine/dom.js"
import { icons } from "../composition/icons.js"
import {
	CHANGE, CHANGE_REPLIES, EXAMPLES, FIRST_ID, LOG, PLANS, PROMPT, REPLIES, REPO_URL, SECOND_ID, STAGES, STEPS,
} from "./content.js"
import { T } from "./beatmap.js"

/**
 * Builds the browser window and rwaft's screens as real, CSS-laid-out HTML,
 * mirroring the product's own markup and classes (Header, Home, PromptBox,
 * Workspace, PricingPlans). Built once; seek() only animates. After building,
 * `measure()` reads where things landed so the camera and cursor can aim at
 * real elements rather than guessed coordinates.
 */

const stroke = (paths, width = 1.6) =>
	`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
const I = {
	...icons,
	coin: stroke(`<ellipse cx="8" cy="5" rx="4.6" ry="2"/><path d="M3.4 5v6c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2V5M3.4 8c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2"/>`),
	moon: stroke(`<path d="M13.2 9.6A5.4 5.4 0 0 1 6.4 2.8a5.4 5.4 0 1 0 6.8 6.8Z"/>`),
	chevronDown: stroke(`<path d="m4.5 6.5 3.5 3.5 3.5-3.5"/>`),
	chevronRight: stroke(`<path d="m6.5 4.5 3.5 3.5-3.5 3.5"/>`),
	lock: stroke(`<rect x="3.6" y="7.2" width="8.8" height="6.4" rx="1.4"/><path d="M5.4 7.2V5.4a2.6 2.6 0 0 1 5.2 0v1.8"/>`, 1.5),
}
const ico = (name, extra = "") => `<span class="ico" ${extra}>${I[name]}</span>`

const MARK = `<svg viewBox="0 0 28 28" fill="none"><rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#fafafa"/><g stroke="#0a0a0b" stroke-width="2.1" stroke-linecap="round"><path d="M6.6 9.6h6.4"/><path d="M6.6 14h8.9"/><path d="M6.6 18.4h5.4"/></g><circle cx="19.7" cy="14" r="2.6" fill="#8b72ff"/></svg>`
const BRAND = `<span class="brand"><span class="mark">${MARK}</span>rwaft</span>`
const NAV = (current) => `<nav class="site-nav">${["How it works", "Pricing", "FAQ"].map((label) => `<span${label === current ? " data-on" : ""}>${label}</span>`).join("")}</nav>`
const CREDITS = ["5 credits", "4 credits", "3 credits", "2 credits"]
const RIGHT = `
	<div class="hdr-right">
		<span class="chip">${ico("coin")}<span class="chip-count">${CREDITS.map((c) => `<span>${c}</span>`).join("")}</span></span>
		<span class="icon-btn">${ico("moon")}</span>
		<span class="account-pill"><span class="avatar">A</span>Alex${ico("chevronDown")}</span>
	</div>`

const COSTS = ["1 credit · 5 left", "1 credit · 4 left", "1 credit · 3 left", "1 credit · 2 left"]
const promptBar = (compact) => `
	<div class="prompt-bar">
		<div class="mode"><b class="mode-thumb"></b>
			<span data-mode="prompt">${ico("spark")}${compact ? "Prompt" : "Describe an app"}</span>
			<span data-mode="repo">${ico("repo")}${compact ? "Repo" : "GitHub repo"}</span>
		</div>
		<span class="prompt-cost">${COSTS.map((c) => `<span>${c}</span>`).join("")}</span>
		<span class="send">${ico("send")}</span>
	</div>`

function homeScreen(parent) {
	const scr = h("div", "scr scr-home", parent)
	h("div", "wash", scr)
	const scroll = h("div", "home-scroll", scr)
	scroll.innerHTML = `
		<header class="hdr hdr--home">${BRAND}${NAV()}${RIGHT}</header>
		<main class="home">
			<section class="hero">
				<h1>What should we build?</h1>
				<p class="hero-sub">rwaft is an AI app builder. Describe an app in plain words, and it writes it, builds it and hosts it at its own link while you watch the real build.</p>
				<div class="prompt prompt--hero">
					<div class="ta">
						<span class="ph" data-ph="prompt">Describe the app you want, who it's for, and what it should do…</span>
						<span class="ph" data-ph="repo">Paste a public GitHub repository URL…</span>
						<span class="val" data-val="prompt">${PROMPT}</span>
						<span class="val" data-val="repo">${REPO_URL}</span>
						<i class="caret"></i>
					</div>
					${promptBar(false)}
					<div class="prompt-focus"></div>
				</div>
				<div class="examples">${EXAMPLES.map((e) => `<span class="example">${e}</span>`).join("")}</div>
			</section>
			<section class="land">
				<h2 class="land-title">How the AI app builder works</h2>
				<p class="land-lead">From one sentence to a live website, with nothing hidden in between.</p>
				<ol class="land-grid">${STEPS.map((s, i) => `<li class="land-card"><span class="land-step-num">${i + 1}</span><h3>${s.title}</h3><p>${s.body}</p></li>`).join("")}</ol>
			</section>
		</main>`
	const q = (s) => scroll.querySelector(s)
	return {
		scr, scroll,
		prompt: q(".prompt--hero"),
		focus: q(".prompt--hero .prompt-focus"),
		phPrompt: q('[data-ph="prompt"]'), phRepo: q('[data-ph="repo"]'),
		valPrompt: q('[data-val="prompt"]'), valRepo: q('[data-val="repo"]'),
		caret: q(".prompt--hero .caret"),
		thumb: q(".prompt--hero .mode-thumb"),
		modePrompt: q('.prompt--hero [data-mode="prompt"]'), modeRepo: q('.prompt--hero [data-mode="repo"]'),
		costs: [...scroll.querySelectorAll(".prompt--hero .prompt-cost span")],
		send: q(".prompt--hero .send"),
		chip: [...scroll.querySelectorAll(".example")][1],
		chips: [...scroll.querySelectorAll(".example")],
		hero: q(".hero"),
		credits: [...scroll.querySelectorAll(".chip-count span")],
		ta: q(".prompt--hero .ta"),
	}
}

const reply = (r) => `<div class="msg"${r.tone ? ` data-tone="${r.tone}"` : ""}><p>${r.text}</p><span class="msg-raw">${ico("chevronRight")}${r.lines} log line${r.lines === 1 ? "" : "s"}</span></div>`
const live = (id, more) => `
	<div class="msg" data-tone="good">
		<p class="msg-live"><canvas class="bmp" data-src="assets/live-check-still.png"></canvas><span><strong>Your site is live.</strong> Share the link with anyone.</span></p>
		<span class="msg-link">https://${id}.rwaft.live/ ${ico("external")}</span>
		${more ? `<p>Want something different? Describe a change below and rwaft updates this app. This version stays live at its own link.</p><span class="text-btn">Open the version before this change</span>` : ""}
	</div>`

function workScreen(parent) {
	const scr = h("div", "scr scr-work", parent)
	const messages = [
		{ at: T.send + 0.22, html: `<div class="msg msg--you"><p>${PROMPT}</p><span class="msg-time">14:32</span></div>` },
		...REPLIES.map((r) => ({ at: r.at, html: reply(r) })),
		{ at: T.live, html: live(FIRST_ID, false) },
		{ at: T.changeSend + 0.06, html: `<div class="msg msg--you"><span class="msg-kicker">Change</span><p>${CHANGE}</p><span class="msg-time">14:36</span></div>` },
		...CHANGE_REPLIES.map((r) => ({ at: r.at, html: reply(r) })),
		{ at: T.changeLive, html: live(SECOND_ID, true) },
	]
	scr.innerHTML = `
		<header class="hdr hdr--build">${BRAND}
			<div class="hdr-middle"><span class="build-name">${PROMPT}</span>
				<span class="status" style="width:74px"><span class="status-face" data-state="building">Building</span><span class="status-face" data-state="live">Live</span></span>
			</div>${RIGHT}
		</header>
		<main class="workspace">
			<section class="chat">
				<div class="thread"><div class="thread-in">${messages.map((m) => m.html).join("")}
					<p class="thread-status"><span class="typing"><i></i><i></i><i></i></span>rwaft is working</p>
				</div></div>
				<div class="chat-prompt"><div class="prompt prompt--compact">
					<div class="ta">
						<span class="ph" data-ph="describe">Describe another app…</span>
						<span class="ph" data-ph="change">Describe a change to this app…</span>
						<span class="val">${CHANGE}</span><i class="caret"></i>
					</div>
					${promptBar(true)}
					<div class="prompt-focus"></div>
				</div></div>
			</section>
			<section class="panel">
				<div class="panel-bar">
					<div class="tabs"><b class="tab-thumb"></b><span data-tab="preview">Preview</span><span data-tab="log">Log<b class="tab-count">0</b></span></div>
					<div class="address"><span class="address-dot"></span><span class="address-text"><span>${FIRST_ID}.rwaft.live</span><span>${SECOND_ID}.rwaft.live</span></span></div>
					<span class="icon-btn" data-btn="copy">${ico("copy", 'data-i="copy"')}${ico("check", 'data-i="check" style="position:absolute;color:var(--live-c)"')}</span>
					<span class="icon-btn" data-btn="reload">${ico("refresh")}</span>
					<span class="icon-btn" data-btn="open">${ico("external")}</span>
				</div>
				<div class="panel-body">
					<div class="layer state">
						<canvas class="bmp" data-src="assets/building-dark-still.png"></canvas>
						<h2>${[...new Set(STAGES.map((s) => s.label)), "Building · 1 fix"].map((l) => `<span data-h2="${l}">${l}</span>`).join("")}</h2>
						<p class="state-time">0:00</p>
						<ol class="steps">${STAGES.map((s) => `<li><span class="steps-dot"><i class="dot-pending"></i><i class="dot-live"></i><i class="dot-done">${ico("checkBold")}</i></span><span class="steps-label">${s.label}</span></li>`).join("")}</ol>
					</div>
					<div class="layer log"><div class="log-in">${LOG.map((l) => `<p class="raw" data-level="${l.level ?? "info"}"><span class="raw-time">${l.ts}</span><span class="raw-msg">${l.msg.startsWith("✓ ") ? `${ico("check")}${l.msg.slice(2)}` : l.msg}</span></p>`).join("")}</div></div>
					<div class="layer frame frame-light"></div>
					<div class="layer frame frame-dark"></div>
				</div>
				<div class="tip">${ico("check")}Link copied</div>
			</section>
		</main>`
	const q = (s) => scr.querySelector(s)
	const qa = (s) => [...scr.querySelectorAll(s)]
	return {
		scr, messages,
		msgEls: qa(".thread-in > .msg"),
		threadIn: q(".thread-in"), thread: q(".thread"), typing: q(".thread-status"), typingDots: qa(".typing i"),
		statusBuilding: q('.status-face[data-state="building"]'), statusLive: q('.status-face[data-state="live"]'),
		credits: qa(".chip-count span"),
		chatPrompt: q(".prompt--compact"), chatFocus: q(".prompt--compact .prompt-focus"),
		chatPhDescribe: q('[data-ph="describe"]'), chatPhChange: q('[data-ph="change"]'),
		chatVal: q(".prompt--compact .val"), chatCaret: q(".prompt--compact .caret"),
		chatThumb: q(".prompt--compact .mode-thumb"), chatModePrompt: q('.prompt--compact [data-mode="prompt"]'),
		chatCosts: qa(".prompt--compact .prompt-cost span"), chatSend: q(".prompt--compact .send"),
		tabThumb: q(".tab-thumb"), tabPreview: q('[data-tab="preview"]'), tabLog: q('[data-tab="log"]'), tabCount: q(".tab-count"),
		addressDot: q(".address-dot"), addressTexts: qa(".address-text span"), address: q(".address"),
		copyBtn: q('[data-btn="copy"]'), copyIcon: q('[data-i="copy"]'), checkIcon: q('[data-i="check"]'), tip: q(".tip"),
		panel: q(".panel"), panelBody: q(".panel-body"), panelBar: q(".panel-bar"), chat: q(".chat"),
		state: q(".state"), stateH2: qa(".state h2 span"), stateTime: q(".state-time"), stateImg: q(".state .bmp"),
		stepDots: qa(".steps li").map((li) => ({ li, pending: li.querySelector(".dot-pending"), live: li.querySelector(".dot-live"), done: li.querySelector(".dot-done"), check: li.querySelector(".dot-done path"), label: li.querySelector(".steps-label") })),
		log: q(".log"), logIn: q(".log-in"), logLines: qa(".raw"),
		frameLight: q(".frame-light"), frameDark: q(".frame-dark"),
	}
}

function pricingScreen(parent) {
	const scr = h("div", "scr scr-pricing", parent)
	scr.innerHTML = `
		<header class="hdr hdr--page">${BRAND}${NAV("Pricing")}<div class="hdr-right"><span class="pill-btn">Start building</span></div></header>
		<main class="info"><section class="land">
			<h1 class="land-title">Pricing</h1>
			<p class="land-lead">Start with free credits, then buy a credit pack when you need more. No subscription. Every chat is one complete build.</p>
			<ul class="land-grid plans">${PLANS.map((p) => `<li class="land-card plan"><h3>${p.name}</h3><p class="price">${p.price}</p><p>${p.detail}</p></li>`).join("")}</ul>
			<ul class="land-notes">
				<li>A chat costs 1 credit. Deploying a GitHub repository costs 1 credit.</li>
				<li>If a build fails, its credits are refunded automatically.</li>
				<li>Buy credits any time from the credits menu once you're signed in. Payment is handled by Dodo Payments.</li>
			</ul>
		</section></main>`
	return { scr, cards: [...scr.querySelectorAll(".plan")], land: scr.querySelector(".land") }
}

/**
 * Images are drawn once into canvases from bitmaps decoded at load
 * (window.__bitmaps, see main.js). An <img> is re-decoded asynchronously at
 * each new zoom level and paints nothing until that finishes, so frames would
 * depend on render history; a canvas paints synchronously at any scale.
 */
export function bitmap(canvas, src) {
	const image = window.__bitmaps[src]
	canvas.width = image.naturalWidth
	canvas.height = image.naturalHeight
	canvas.getContext("2d").drawImage(image, 0, 0)
	return canvas
}

export function buildWindow(world) {
	const win = h("div", "win", world)
	win.innerHTML = `
		<div class="win-bar">
			<div class="win-dots"><i></i><i></i><i></i></div>
			<div class="win-url"><span>${ico("lock")}rwaft.live</span><span>${ico("lock")}rwaft.live/pricing</span></div>
		</div>`
	const content = h("div", "win-content", win)
	const home = homeScreen(content)
	const work = workScreen(content)
	const pricing = pricingScreen(content)
	for (const canvas of win.querySelectorAll("canvas[data-src]")) bitmap(canvas, canvas.dataset.src)
	const urls = [...win.querySelectorAll(".win-url > span")]
	return { win, content, home, work, pricing, urls }
}

/** Where elements sit in window coordinates (the window's top-left is the world origin). */
export function measure(ui) {
	const origin = ui.win.getBoundingClientRect()
	const rect = (el, pad = 0) => {
		const r = el.getBoundingClientRect()
		return { x: r.left - origin.left - pad, y: r.top - origin.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad }
	}
	const center = (el) => {
		const r = rect(el)
		return [r.x + r.w / 2, r.y + r.h / 2]
	}
	const { home, work, pricing } = ui
	const offset = (el, parent) => {
		const a = el.getBoundingClientRect()
		const b = parent.getBoundingClientRect()
		return { top: a.top - b.top, height: a.height, left: a.left - b.left, width: a.width }
	}
	return {
		rect, center,
		full: { x: 0, y: 0, w: 1600, h: 880 },
		hero: rect(home.hero, 34),
		homePrompt: rect(home.prompt, 60),
		chip: center(home.chip),
		homeSend: center(home.send),
		homeTa: [rect(home.ta).x + 220, center(home.ta)[1] - 18],
		modeRepo: center(home.modeRepo),
		modePrompt: offset(home.modePrompt, home.modePrompt.parentElement),
		modeRepoBox: offset(home.modeRepo, home.modeRepo.parentElement),
		promptTextLeft: offset(home.valPrompt, home.ta).left,
		valPromptW: home.valPrompt.getBoundingClientRect().width,
		valRepoW: home.valRepo.getBoundingClientRect().width,
		chatVal: offset(work.chatVal, work.chatVal.parentElement),
		chatValW: work.chatVal.getBoundingClientRect().width,
		chatModePrompt: offset(work.chatModePrompt, work.chatModePrompt.parentElement),
		panel: rect(work.panel),
		chat: rect(work.chat),
		chatLower: (() => {
			const c = rect(work.chat)
			return { x: c.x, y: c.y + c.h * 0.36, w: c.w, h: c.h * 0.64 }
		})(),
		bar: (() => {
			const b = rect(work.panelBar)
			return { x: b.x - 24, y: b.y - 120, w: b.w + 48, h: 420 }
		})(),
		chatBottom: (() => {
			const c = rect(work.chat)
			return { x: c.x - 10, y: c.y + c.h - 380, w: c.w + 20, h: 400 }
		})(),
		tabLog: center(work.tabLog),
		tabPreview: center(work.tabPreview),
		tabPreviewBox: offset(work.tabPreview, work.tabPreview.parentElement),
		tabLogBox: offset(work.tabLog, work.tabLog.parentElement),
		copy: center(work.copyBtn),
		copyRect: rect(work.copyBtn),
		chatTa: [rect(work.chatPrompt).x + 120, rect(work.chatPrompt).y + 22],
		chatSend: center(work.chatSend),
		panelBody: rect(work.panelBody),
		threadH: work.thread.getBoundingClientRect().height,
		msgs: work.msgEls.map((el) => offset(el, work.threadIn)),
		logH: work.log.getBoundingClientRect().height - 28,
		logLines: work.logLines.map((el) => offset(el, work.logIn)),
		pricing: rect(pricing.land, 40),
		freeCard: center(pricing.cards[0]),
	}
}

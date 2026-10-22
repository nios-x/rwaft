import { css, h } from "../engine/dom.js"
import { clamp, ease, progress, seeded } from "../engine/math.js"
import { enter, fxStyle } from "../engine/transitions.js"

/**
 * The example app rwaft builds in the overview: "tiny habits", a habit
 * tracker with streaks. Deliberately not rwaft-branded (warm paper, forest
 * green, a serif headline) so it reads as the maker's own site. `theme` is
 * "light" or "dark": the dark one is the version after "Make it dark, keep
 * the green." The content column is 796 px wide, centred in `width`, with the
 * nav spanning the whole page; the caller scales the result to fit.
 */

const COLS = 36
const ROWS = 7
const CELL = 16
const GAP = 4

const HABITS = [
	{ name: "Read 20 pages", streak: "12-day streak", days: [1, 1, 1, 1, 1, 0, 1] },
	{ name: "Morning run", streak: "5-day streak", days: [1, 0, 1, 1, 1, 1, 0] },
	{ name: "Water the plants", streak: "21-day streak", days: [1, 1, 1, 1, 1, 1, 1] },
	{ name: "Evening walk", streak: "3-day streak", days: [0, 1, 0, 0, 1, 1, 1] },
]

export function buildSite(parent, theme, width = 796) {
	const root = h("div", `th-site th-${theme}`, parent)
	const side = Math.max(0, (width - 796) / 2)
	css(root, { width: `${width}px` })

	const nav = h("div", "th-nav", root)
	css(nav, { padding: `0 ${side + 32}px` })
	const inner = h("div", "th-inner", root)
	css(inner, { left: `${side}px` })
	nav.innerHTML = `
		<span class="th-logo"><i></i>tiny habits</span>
		<span class="th-link">Today</span>
		<span class="th-link">Streaks</span>
		<span class="th-btn">New habit</span>`

	const hero = h("div", "th-hero", inner)
	const eyebrow = h("span", "th-eyebrow", hero, "Day 47 of showing up")
	const title = h("span", "th-h1", hero)
	title.innerHTML = "Small steps,<br>every day."
	const lead = h("span", "th-p", hero, "Track the habits that matter. Keep the streak, skip the guilt.")
	const ctas = h("span", "th-ctas", hero)
	ctas.innerHTML = `<span class="th-btn">Start tracking</span><span class="th-ghost">See how it works</span>`

	const week = h("div", "th-week", inner)
	const head = h("div", "th-week-head", week)
	head.innerHTML = "This week <em>4 habits</em>"
	const rows = HABITS.map((habit) => {
		const row = h("div", "th-habit", week)
		row.innerHTML = `<span class="th-habit-text"><b>${habit.name}</b><em>${habit.streak}</em></span>`
		const days = h("span", "th-days", row)
		for (const on of habit.days) {
			const day = h("i", null, days)
			if (on) day.dataset.on = ""
		}
		return row
	})

	const yearHead = h("div", "th-year-head", inner)
	yearHead.innerHTML = `Your year <em>Less <i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i> More</em>`
	const random = seeded(47)
	const cells = []
	for (let c = 0; c < COLS; c++) {
		for (let r = 0; r < ROWS; r++) {
			const roll = random() * 0.75 + (c / COLS) * 0.55 - (r === 6 ? 0.2 : 0)
			const level = roll < 0.32 ? 0 : roll < 0.52 ? 1 : roll < 0.72 ? 2 : roll < 0.92 ? 3 : 4
			const cell = h("i", "th-cell", inner)
			cell.dataset.l = String(level)
			css(cell, { left: `${40 + c * (CELL + GAP)}px`, top: `${506 + r * (CELL + GAP)}px` })
			cells.push({ el: cell, c, r })
		}
	}

	const parts = [
		[nav, 0, { y: -6, blur: 2 }],
		[eyebrow, 0.08, {}],
		[title, 0.12, { y: 10, blur: 4, dur: 0.34 }],
		[lead, 0.2, {}],
		[ctas, 0.26, {}],
		[week, 0.1, { y: 10, scale: 0.98, dur: 0.34 }],
		[head, 0.16, {}],
		...rows.map((row, i) => [row, 0.2 + i * 0.05, { y: 6 }]),
		[yearHead, 0.24, {}],
	]

	return {
		root,
		/** Paints the page in the way a browser does: chrome, type, then data. */
		update(t, start) {
			for (const [el, delay, options] of parts) css(el, fxStyle(enter(t, start + delay, { dur: 0.28, ...options })))
			for (const cell of cells) {
				const delay = start + 0.26 + cell.c * 0.009 + cell.r * 0.016
				const u = progress(t, delay, delay + 0.2)
				const k = ease.cubicOut(u)
				css(cell.el, {
					opacity: u <= 0 ? "0" : u >= 1 ? "1" : clamp(k * 1.4).toFixed(3),
					transform: u >= 1 ? "none" : `scale(${(0.4 + 0.6 * k).toFixed(3)})`,
				})
			}
		},
	}
}

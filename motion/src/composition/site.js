import { css, h } from "../engine/dom.js"
import { clamp, ease, progress, seeded } from "../engine/math.js"
import { enter, fxStyle } from "../engine/transitions.js"

/**
 * The example deployment: "Tiny Habits", a small habit tracker someone keeps
 * in `nios-x/tiny-habits`. It is deliberately not rwaft-branded (warm paper,
 * forest green, a serif headline) so it reads as the user's own site.
 *
 * Laid out for a 796 × 704 preview body. `update(t, start)` renders it
 * arriving the way a page paints: chrome first, then type, then data.
 */

const W = 796
const COLS = 36
const ROWS = 7
const CELL = 16
const GAP = 4
const YEAR_LEVELS = ["#ebe6dc", "#d3e6d6", "#a3cdb0", "#5fa47a", "#2f6b4f"]

const HABITS = [
	{ name: "Read 20 pages", streak: "12-day streak", days: [1, 1, 1, 1, 1, 0, 1] },
	{ name: "Morning run", streak: "5-day streak", days: [1, 0, 1, 1, 1, 1, 0] },
	{ name: "Water the plants", streak: "21-day streak", days: [1, 1, 1, 1, 1, 1, 1] },
	{ name: "Evening walk", streak: "3-day streak", days: [0, 1, 0, 0, 1, 1, 1] },
]

export function buildSite(parent) {
	const root = h("div", "site", parent)
	css(root, { width: `${W}px`, height: "704px" })

	const nav = h("div", "site-nav", root)
	css(nav, { width: `${W}px`, height: "64px" })
	nav.innerHTML = `
		<span class="site-logo"><i></i>tiny habits</span>
		<span class="site-link">Today</span>
		<span class="site-link">Streaks</span>
		<span class="site-link">Journal</span>
		<span class="site-btn">New habit</span>`

	const hero = h("div", "site-hero", root)
	css(hero, { left: "40px", top: "106px" })
	const eyebrow = h("span", "site-eyebrow", hero, "Day 47 of showing up")
	const h1 = h("span", "site-h1", hero)
	h1.innerHTML = "Small steps,<br>every day."
	const p = h("span", "site-p", hero, "Track the habits that matter. Keep the streak, skip the guilt.")
	const ctas = h("span", "site-ctas", hero)
	ctas.innerHTML = `<span class="site-btn">Start tracking</span><span class="site-ghost">See how it works</span>`

	const week = h("div", "site-week", root)
	css(week, { left: "452px", top: "96px", width: "304px" })
	const head = h("div", "site-week-head", week)
	head.innerHTML = "This week <em>4 habits</em>"
	const habits = HABITS.map((habit) => {
		const row = h("div", "habit", week)
		row.innerHTML = `<span class="habit-text"><span class="habit-name">${habit.name}</span><span class="habit-streak">${habit.streak}</span></span>`
		const days = h("span", "habit-days", row)
		habit.days.forEach((on) => {
			const b = h("b", null, days)
			if (on) b.dataset.on = ""
		})
		return row
	})

	const year = h("div", "site-year", root)
	css(year, { left: "40px", top: "470px", width: `${COLS * (CELL + GAP) - GAP}px`, height: "180px" })
	const yearHead = h("div", "site-year-head", year)
	css(yearHead, { width: "100%" })
	yearHead.innerHTML = `Your year <em>Less ${YEAR_LEVELS.map((c) => `<b style="background:${c}"></b>`).join("")} More</em>`

	const random = seeded(47)
	const cells = []
	for (let c = 0; c < COLS; c++) {
		for (let r = 0; r < ROWS; r++) {
			const recency = c / COLS
			const roll = random() * 0.75 + recency * 0.55 - (r === 6 ? 0.2 : 0)
			const level = roll < 0.32 ? 0 : roll < 0.52 ? 1 : roll < 0.72 ? 2 : roll < 0.92 ? 3 : 4
			const cell = h("i", "cell", root)
			css(cell, {
				left: `${40 + c * (CELL + GAP)}px`,
				top: `${506 + r * (CELL + GAP)}px`,
				width: `${CELL}px`,
				height: `${CELL}px`,
				background: YEAR_LEVELS[level],
			})
			cells.push({ el: cell, c, r })
		}
	}

	const parts = [
		[nav, 0, { y: -6, blur: 2 }],
		[eyebrow, 0.08, {}],
		[h1, 0.12, { y: 10, blur: 4, dur: 0.34 }],
		[p, 0.2, {}],
		[ctas, 0.26, {}],
		[head, 0.14, {}],
		...habits.map((row, i) => [row, 0.18 + i * 0.05, { y: 6 }]),
		[yearHead, 0.22, {}],
	]

	return {
		root,
		update(t, start) {
			for (const [el, delay, options] of parts) css(el, fxStyle(enter(t, start + delay, { dur: 0.28, ...options })))
			css(week, fxStyle(enter(t, start + 0.1, { y: 10, scale: 0.98, dur: 0.34 })))
			for (const cell of cells) {
				const u = progress(t, start + 0.26 + cell.c * 0.011 + cell.r * 0.018, start + 0.44 + cell.c * 0.011 + cell.r * 0.018)
				const k = ease.cubicOut(u)
				css(cell.el, {
					opacity: u <= 0 ? "0" : u >= 1 ? "1" : clamp(k * 1.4).toFixed(3),
					transform: u >= 1 ? "none" : `scale(${(0.4 + 0.6 * k).toFixed(3)})`,
				})
			}
		},
	}
}

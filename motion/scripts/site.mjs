#!/usr/bin/env node
/**
 * Renders the trailer's demo sites (site/*.html) to the stills it shows:
 *
 *   assets/kaizen-home.jpg          the KAIZEN home screen, 1560 × 900 at 2.75×
 *   assets/kaizen-home-violet.jpg   the same after "Make the accent colour violet."
 *   assets/kaizen-page-<name>.jpg   home, works, about and contact, 1440 × 1920 (the plan list's previews)
 *   assets/gallery-<site>-<page>.jpg  1600 × 1000 thumbnails for the ring of built sites: KAIZEN
 *                                   and the home screen's three example prompts (café, habits, RSVP)
 *
 * Needs the network once: the photos come from picsum.photos.
 */
import { join } from "node:path"
import { ROOT, startServer } from "./lib/server.mjs"
import { launch } from "./lib/browser.mjs"

const { server, url } = await startServer()
const browser = await launch()

async function shoot(file, query, out, { width, height, scale, quality = 93 }) {
	const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale })
	const page = await context.newPage()
	await page.goto(`${url}/site/${file}?${new URLSearchParams(query)}`, { waitUntil: "networkidle", timeout: 120_000 })
	await page.evaluate(() => window.siteReady)
	const broken = await page.evaluate(() => [...document.querySelectorAll(".page.on img")].filter((img) => !img.naturalWidth).map((img) => img.src))
	if (broken.length) throw new Error(`Photos failed to load: ${broken.join(", ")}`)
	await page.screenshot({ path: join(ROOT, out), type: "jpeg", quality })
	await context.close()
	console.log(out)
}

const GALLERY = [
	["kaizen.html", "home", "kaizen-home"], ["kaizen.html", "works", "kaizen-works"], ["kaizen.html", "about", "kaizen-about"], ["kaizen.html", "contact", "kaizen-contact"],
	["cafe.html", "home", "cafe-home"], ["cafe.html", "menu", "cafe-menu"],
	["habits.html", "today", "habits-today"], ["habits.html", "stats", "habits-stats"],
	["rsvp.html", "invite", "rsvp-invite"], ["rsvp.html", "form", "rsvp-form"],
]

try {
	const only = process.argv.includes("--gallery")
	if (!only) {
		for (const accent of ["lime", "violet"]) {
			await shoot("kaizen.html", { page: "home", accent }, `assets/kaizen-home${accent === "lime" ? "" : "-violet"}.jpg`, { width: 1560, height: 900, scale: 2.75 })
		}
		for (const name of ["home", "works", "about", "contact"]) {
			await shoot("kaizen.html", { page: name }, `assets/kaizen-page-${name}.jpg`, { width: 1440, height: 1920, scale: 1 })
		}
	}
	for (const [file, page, name] of GALLERY) {
		await shoot(file, { page }, `assets/gallery-${name}.jpg`, { width: 1600, height: 1000, scale: 1, quality: 86 })
	}
} finally {
	await browser.close()
	server.close()
}

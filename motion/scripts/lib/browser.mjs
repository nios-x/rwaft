import { chromium } from "playwright-core"
import { existsSync, readdirSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

/**
 * Finds a Chromium to drive. Order: CHROMIUM_PATH, the build playwright-core
 * expects, the newest build already in the Playwright cache, then an
 * installed Chrome. Using a cached build means rendering never downloads.
 */
export function findChromium() {
	if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
	try {
		const expected = chromium.executablePath()
		if (existsSync(expected)) return expected
	} catch { /* not installed for this version */ }

	const roots = [
		process.env.PLAYWRIGHT_BROWSERS_PATH,
		join(homedir(), "AppData", "Local", "ms-playwright"),
		join(homedir(), ".cache", "ms-playwright"),
		join(homedir(), "Library", "Caches", "ms-playwright"),
	].filter(Boolean)
	const layouts = {
		win32: { shell: ["chrome-headless-shell-win64", "chrome-headless-shell.exe"], full: ["chrome-win64", "chrome.exe"] },
		linux: { shell: ["chrome-headless-shell-linux64", "chrome-headless-shell"], full: ["chrome-linux64", "chrome"] },
		darwin: { shell: ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"], full: ["chrome-mac-arm64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"] },
	}[platform()]
	const found = []
	for (const root of roots) {
		if (!existsSync(root)) continue
		for (const dir of readdirSync(root)) {
			const match = /^(chromium_headless_shell|chromium)-(\d+)$/.exec(dir)
			if (!match || !layouts) continue
			const [sub, exe] = match[1] === "chromium" ? layouts.full : layouts.shell
			const path = join(root, dir, sub, exe)
			if (existsSync(path)) found.push({ path, revision: Number(match[2]), shell: match[1] !== "chromium" })
		}
	}
	found.sort((a, b) => b.revision - a.revision || Number(b.shell) - Number(a.shell))
	if (found[0]) return found[0].path

	const system = [
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
	].find(existsSync)
	if (system) return system
	throw new Error("No Chromium found. Run `npx playwright-core install chromium` or set CHROMIUM_PATH.")
}

/**
 * Opens the film in render mode at its exact pixel size. LCD (subpixel) text
 * is disabled: colour fringes would smear under video chroma subsampling.
 */
export async function openFilm(baseUrl, { entry = "index.html", format = "square", scale = 1, debug = false, browser } = {}) {
	const own = !browser
	browser ??= await launch()
	const query = new URLSearchParams({ render: "1", format })
	if (debug) query.set("debug", "1")
	const probe = await browser.newPage()
	await probe.goto(`${baseUrl}/${entry}?${query}`)
	await probe.waitForFunction(() => window.__film?.ready === true, null, { timeout: 30_000 })
	const view = await probe.evaluate(() => window.__film.view)
	await probe.close()

	// Chrome ignores a device scale factor below 1, so downscaled renders ask
	// the capture itself for a smaller image; supersampled ones raise the DPR.
	const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: Math.max(1, scale) })
	const clip = scale < 1 ? { x: 0, y: 0, width: view.width, height: view.height, scale } : undefined
	const page = await context.newPage()
	await page.goto(`${baseUrl}/${entry}?${query}`)
	await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 30_000 })
	const film = await page.evaluate(() => ({ duration: window.__film.duration, fps: window.__film.fps, view: window.__film.view, cues: window.__film.cues, bpm: window.__film.bpm }))
	const cdp = await context.newCDPSession(page)

	return {
		browser,
		page,
		film,
		/** Draws time t and returns a PNG of exactly that frame. */
		async frame(t) {
			await page.evaluate((time) => window.__film.seek(time), t)
			const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true, ...(clip ? { clip } : {}) })
			return Buffer.from(data, "base64")
		},
		/** Largest on-screen displacement (CSS px at 1×) of any visible element between t0 and t1. */
		motion(t0, t1) {
			return page.evaluate(([a, b]) => window.__film.motion(a, b), [t0, t1])
		},
		async close() {
			await context.close()
			if (own) await browser.close()
		},
	}
}

/**
 * Frame-exact capture needs two compositor flags. Without them a page that
 * has drawn many frames can hand back a screenshot in which some 256 px
 * raster tiles still hold the previous frame (Chrome draws whatever tiles
 * are ready and re-rasters only regions it believes changed), and averaged
 * motion-blur samples turn those stale tiles into faint ghost lines.
 */
export function launch() {
	return chromium.launch({
		executablePath: findChromium(),
		args: [
			"--disable-lcd-text",
			"--force-color-profile=srgb",
			"--hide-scrollbars",
			"--mute-audio",
			"--disable-gpu-vsync",
			"--run-all-compositor-stages-before-draw",
			"--disable-partial-raster",
			"--disable-checker-imaging",
		],
	})
}

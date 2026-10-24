/**
 * Tells IndexNow (Bing, which also feeds ChatGPT search and Copilot, plus
 * Yandex, Seznam and Naver) which pages changed, so they're recrawled in
 * hours instead of whenever the crawler next comes by.
 *
 * Reads the live sitemap and submits the URLs whose lastmod is recent, since
 * IndexNow asks for changed pages, not the whole site on every deploy. Run it
 * after a deploy is live: the .github/workflows/indexnow.yml job does, once
 * Vercel reports a production deployment. `--all` submits every URL.
 *
 * The key isn't a secret: IndexNow proves ownership by fetching it from the
 * site, at public/<key>.txt.
 */

const KEY = "366d71c38cdbc23ee7e5e3f6ffcc4d27"
const SITE = (process.env.SITE_URL || "https://rwaft.live").replace(/\/+$/, "")
const SINCE_DAYS = Number(process.env.INDEXNOW_SINCE_DAYS || 3)
const all = process.argv.includes("--all")

const sitemap = await fetch(`${SITE}/sitemap.xml`).then((response) => {
	if (!response.ok) throw new Error(`sitemap.xml answered ${response.status}`)
	return response.text()
})

const since = Date.now() - SINCE_DAYS * 86_400_000
const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
	.map(([, entry]) => ({
		loc: entry.match(/<loc>([^<]+)<\/loc>/)?.[1],
		lastmod: Date.parse(entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? ""),
	}))
	.filter((entry) => entry.loc && (all || !(entry.lastmod < since)))
	.map((entry) => entry.loc)

if (urls.length === 0) {
	console.log(`No page changed in the last ${SINCE_DAYS} days; nothing to submit.`)
	process.exit(0)
}

const response = await fetch("https://api.indexnow.org/indexnow", {
	method: "POST",
	headers: { "Content-Type": "application/json; charset=utf-8" },
	body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
})

// 200 and 202 both mean accepted; 202 while the key is still being checked.
console.log(`IndexNow answered ${response.status} for ${urls.length} URLs`)
if (response.status !== 200 && response.status !== 202) {
	console.error(await response.text())
	process.exit(1)
}
